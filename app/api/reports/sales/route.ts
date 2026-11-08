import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getOrderIdsWithLatestStatusInRange } from "@/lib/status-changes";
import { getOrSetReportCache, invalidateReportCache } from "@/lib/report-cache";

const BUSINESS_UTC_OFFSET_MINUTES = 8 * 60;
const SALES_REPORT_CACHE_TTL_MS = 30_000;

function businessDayStart(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0) - BUSINESS_UTC_OFFSET_MINUTES * 60 * 1000);
}

function nextBusinessDay(date: Date): Date {
  return new Date(date.getTime() + 24 * 60 * 60 * 1000);
}

function parseDateStart(value: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const [y, m, d] = value.split("-").map(Number);
  return businessDayStart(y, m, d);
}

function toNumber(value: unknown): number {
  if (value == null) return 0;
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function toReportCode(input: { sku: string | null; barcode: string | null; id: string }): string {
  const sku = String(input.sku ?? "").trim();
  if (sku) return sku;
  const barcode = String(input.barcode ?? "").trim();
  if (barcode) return barcode;
  return input.id;
}

function formatYmd(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function dayDiffInclusive(from: Date, to: Date): number {
  const fromStart = businessDayStart(from.getUTCFullYear(), from.getUTCMonth() + 1, from.getUTCDate());
  const toStart = businessDayStart(to.getUTCFullYear(), to.getUTCMonth() + 1, to.getUTCDate());
  const diffMs = toStart.getTime() - fromStart.getTime();
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  return Math.max(1, diffDays + 1);
}

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id || String(session.user.role ?? "").toUpperCase() !== "ADMIN") {
    return null;
  }
  return session;
}

async function ensureSalesReportTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS sales_report_items (
      id VARCHAR(191) NOT NULL,
      product_id VARCHAR(191) NOT NULL,
      purchase_price DECIMAL(10,2) NOT NULL DEFAULT 0,
      selling_price DECIMAL(10,2) NOT NULL DEFAULT 0,
      daily_ad_cost DECIMAL(10,2) NOT NULL DEFAULT 0,
      unit_ad_cap DECIMAL(10,2) NOT NULL DEFAULT 0,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (id),
      UNIQUE KEY sales_report_items_product_id_key (product_id),
      KEY sales_report_items_created_at_idx (created_at)
    )
  `);

  const existingColumns = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
    `
      SELECT COLUMN_NAME AS column_name
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'sales_report_items'
        AND COLUMN_NAME IN ('daily_ad_cost', 'unit_ad_cap')
    `,
  );

  const columnSet = new Set(existingColumns.map((row) => row.column_name));
  if (!columnSet.has("daily_ad_cost")) {
    await prisma.$executeRawUnsafe(
      "ALTER TABLE sales_report_items ADD COLUMN daily_ad_cost DECIMAL(10,2) NOT NULL DEFAULT 0",
    );
  }
  if (!columnSet.has("unit_ad_cap")) {
    await prisma.$executeRawUnsafe(
      "ALTER TABLE sales_report_items ADD COLUMN unit_ad_cap DECIMAL(10,2) NOT NULL DEFAULT 0",
    );
  }
}

async function getDeliveredOrderIds(dayStart: Date, dayEnd: Date): Promise<string[]> {
  const deliveredOrderIdsFromStatusLog = await getOrderIdsWithLatestStatusInRange(prisma, "DELIVERED", {
    gte: dayStart,
    lte: dayEnd,
  });

  const deliveredWithoutStatusLog = await prisma.order.findMany({
    where: {
      status: "DELIVERED",
      updatedAt: {
        gte: dayStart,
        lte: dayEnd,
      },
      auditLogs: {
        none: {
          action: "STATUS_CHANGED",
          newValue: "DELIVERED",
        },
      },
    },
    select: { id: true },
  });

  const candidateOrderIds = Array.from(new Set([
    ...deliveredOrderIdsFromStatusLog,
    ...deliveredWithoutStatusLog.map((order) => order.id),
  ]));

  if (candidateOrderIds.length === 0) {
    return [];
  }

  // Keep parity with product-status report: count only orders currently in DELIVERED status.
  const currentlyDeliveredOrders = await prisma.order.findMany({
    where: {
      id: { in: candidateOrderIds },
      status: "DELIVERED",
    },
    select: { id: true },
  });

  return currentlyDeliveredOrders.map((order) => order.id);
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireAdmin();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await ensureSalesReportTable();

    const { searchParams } = new URL(req.url);
    const now = new Date();
    const fallbackDay = businessDayStart(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate());
    const rawFrom = searchParams.get("fromDate");
    const rawTo = searchParams.get("toDate");

    const parsedFrom = parseDateStart(rawFrom) ?? fallbackDay;
    const parsedTo = parseDateStart(rawTo) ?? fallbackDay;
    const dayStart = parsedFrom <= parsedTo ? parsedFrom : parsedTo;
    const toStart = parsedFrom <= parsedTo ? parsedTo : parsedFrom;
    const dayEnd = new Date(nextBusinessDay(toStart).getTime() - 1);

    const cacheKey = `report:sales:${formatYmd(dayStart)}:${formatYmd(toStart)}`;
    const payload = await getOrSetReportCache(cacheKey, SALES_REPORT_CACHE_TTL_MS, async () => {
      const dayCount = dayDiffInclusive(dayStart, toStart);

      const [reportItemsRaw, products] = await Promise.all([
        prisma.$queryRawUnsafe<Array<{
          id: string;
          product_id: string;
          daily_ad_cost: unknown;
          unit_ad_cap: unknown;
        }>>(
          "SELECT id, product_id, daily_ad_cost, unit_ad_cap FROM sales_report_items ORDER BY created_at ASC",
        ),
        prisma.product.findMany({
          select: {
            id: true,
            name: true,
            status: true,
            sku: true,
            barcode: true,
          },
          orderBy: { name: "asc" },
        }),
      ]);

      const deliveredOrderIds = await getDeliveredOrderIds(dayStart, dayEnd);

      const soldQtyByProduct = deliveredOrderIds.length > 0
        ? await prisma.orderItem.groupBy({
            by: ["productId"],
            where: {
              orderId: { in: deliveredOrderIds },
            },
            _sum: {
              qty: true,
            },
          })
        : [];

      const productById = new Map(products.map((product) => [product.id, product]));

      const soldQtyByReportCode = new Map<string, number>();
      for (const grouped of soldQtyByProduct) {
        const product = productById.get(grouped.productId);
        if (!product) continue;

        const code = toReportCode({
          id: product.id,
          sku: product.sku,
          barcode: product.barcode,
        })
        soldQtyByReportCode.set(code, (soldQtyByReportCode.get(code) ?? 0) + Number(grouped._sum.qty ?? 0));
      }

      const items = reportItemsRaw
        .map((row) => {
          const product = productById.get(row.product_id);
          if (!product) return null;

          const reportCode = toReportCode({
            id: product.id,
            sku: product.sku,
            barcode: product.barcode,
          });

          const soldQty = soldQtyByReportCode.get(reportCode) ?? 0;
          return {
            id: row.id,
            productId: row.product_id,
            productCode: reportCode,
            productStatus: product.status,
            familyCode: product.sku ?? null,
            variantCode: product.barcode ?? null,
            dailyAdCost: toNumber(row.daily_ad_cost),
            unitAdCap: toNumber(row.unit_ad_cap),
            soldQty,
          };
        })
        .filter(Boolean) as Array<{
          id: string;
          productId: string;
          productCode: string;
          productStatus: string;
          familyCode: string | null;
          variantCode: string | null;
          dailyAdCost: number;
          unitAdCap: number;
          soldQty: number;
        }>;

      return {
        fromDate: formatYmd(dayStart),
        toDate: formatYmd(toStart),
        dayCount,
        products: products.map((product) => ({
          id: product.id,
          name: product.name,
          status: product.status,
          familyCode: product.sku ?? null,
          variantCode: product.barcode ?? null,
        })),
        items,
      };
    });

    return NextResponse.json(payload);
  } catch (error) {
    console.error("Sales report GET error:", error);
    return NextResponse.json({ error: "Алдаа гарлаа" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAdmin();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await ensureSalesReportTable();

    const body = await req.json();
    const productId = String(body?.productId ?? "").trim();
    const dailyAdCost = toNumber(body?.dailyAdCost);
    const unitAdCap = toNumber(body?.unitAdCap);

    if (!productId) {
      return NextResponse.json({ error: "Бараа сонгоно уу" }, { status: 400 });
    }

    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, sku: true, barcode: true },
    });

    if (!product) {
      return NextResponse.json({ error: "Бараа олдсонгүй" }, { status: 404 });
    }

    const reportCode = toReportCode({ id: product.id, sku: product.sku, barcode: product.barcode });

    const sameCodeProducts = await prisma.product.findMany({
      where: {
        OR: [
          { sku: reportCode },
          { barcode: reportCode },
          { id: reportCode },
        ],
      },
      select: { id: true },
    });

    const candidateProductIds = Array.from(new Set([
      product.id,
      ...sameCodeProducts.map((entry) => entry.id),
    ]));

    const placeholders = candidateProductIds.map(() => "?").join(",");
    const existing = candidateProductIds.length > 0
      ? await prisma.$queryRawUnsafe<Array<{ id: string }>>(
          `SELECT id FROM sales_report_items WHERE product_id IN (${placeholders}) LIMIT 1`,
          ...candidateProductIds,
        )
      : [];

    if (existing.length > 0) {
      return NextResponse.json({ success: true, id: existing[0].id, alreadyExists: true }, { status: 200 });
    }

    const id = randomUUID();
    await prisma.$executeRawUnsafe(
      "INSERT INTO sales_report_items (id, product_id, daily_ad_cost, unit_ad_cap) VALUES (?, ?, ?, ?)",
      id,
      productId,
      dailyAdCost,
      unitAdCap,
    );

    invalidateReportCache("report:sales:");

    return NextResponse.json({ success: true, id }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error ?? "").toLowerCase();
    if (message.includes("duplicate entry") || message.includes("unique")) {
      return NextResponse.json({ success: true, alreadyExists: true }, { status: 200 });
    }

    console.error("Sales report POST error:", error);
    return NextResponse.json({ error: "Алдаа гарлаа" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireAdmin();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await ensureSalesReportTable();

    const body = await req.json();
    const id = String(body?.id ?? "").trim();
    const dailyAdCost = toNumber(body?.dailyAdCost);
    const unitAdCap = toNumber(body?.unitAdCap);

    if (!id) {
      return NextResponse.json({ error: "ID дутуу байна" }, { status: 400 });
    }

    const updatedCount = await prisma.$executeRawUnsafe(
      "UPDATE sales_report_items SET daily_ad_cost = ?, unit_ad_cap = ? WHERE id = ?",
      dailyAdCost,
      unitAdCap,
      id,
    );

    if (!updatedCount) {
      return NextResponse.json({ error: "Мөр олдсонгүй" }, { status: 404 });
    }

    invalidateReportCache("report:sales:");

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Sales report PATCH error:", error);
    return NextResponse.json({ error: "Алдаа гарлаа" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await requireAdmin();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await ensureSalesReportTable();

    const body = await req.json();
    const id = String(body?.id ?? "").trim();

    if (!id) {
      return NextResponse.json({ error: "ID дутуу байна" }, { status: 400 });
    }

    await prisma.$executeRawUnsafe("DELETE FROM sales_report_items WHERE id = ?", id);

    invalidateReportCache("report:sales:");

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Sales report DELETE error:", error);
    return NextResponse.json({ error: "Алдаа гарлаа" }, { status: 500 });
  }
}
