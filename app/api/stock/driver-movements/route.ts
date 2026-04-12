import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const BUSINESS_TIME_ZONE = "Asia/Ulaanbaatar";
const BUSINESS_UTC_OFFSET_MINUTES = 8 * 60;

function parseDayStart(value: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0) - BUSINESS_UTC_OFFSET_MINUTES * 60 * 1000);
}

function toDayEnd(dayStart: Date): Date {
  return new Date(dayStart.getTime() + 24 * 60 * 60 * 1000 - 1);
}

function toDayKey(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";

  return `${year}-${month}-${day}`;
}

function todayKey(): string {
  return toDayKey(new Date());
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

interface MovementEvent {
  createdAt: Date;
  productId: string;
  delta: number;
  added: number;
  removed: number;
}

interface DailyProductTotals {
  [productId: string]: number;
}

function addDailyValue(
  map: Record<string, DailyProductTotals>,
  day: string,
  productId: string,
  quantity: number,
) {
  if (!Number.isFinite(quantity) || quantity <= 0) return;
  if (!map[day]) map[day] = {};
  map[day][productId] = (map[day][productId] ?? 0) + quantity;
}

function subtractDailyValue(
  map: Record<string, DailyProductTotals>,
  day: string,
  productId: string,
  quantity: number,
) {
  if (!Number.isFinite(quantity) || quantity <= 0) return;
  if (!map[day]) map[day] = {};
  map[day][productId] = Math.max(0, (map[day][productId] ?? 0) - quantity);
}

function extractStockAuditMovement(
  raw: string | null,
  fallbackDriverId: string | null,
): { driverId: string | null; items: Array<{ productId: string; qty: number }> } | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as
      | Array<{ productId?: string; qty?: number }>
      | { driverId?: string | null; items?: Array<{ productId?: string; qty?: number }> }
      | null;

    if (Array.isArray(parsed)) {
      return {
        driverId: fallbackDriverId,
        items: parsed
          .filter((item): item is { productId: string; qty: number } => Boolean(item?.productId) && Number.isFinite(Number(item?.qty)))
          .map((item) => ({
            productId: item.productId,
            qty: Number(item.qty),
          })),
      };
    }

    if (parsed && typeof parsed === "object" && Array.isArray(parsed.items)) {
      return {
        driverId: typeof parsed.driverId === "string" ? parsed.driverId : fallbackDriverId,
        items: parsed.items
          .filter((item): item is { productId: string; qty: number } => Boolean(item?.productId) && Number.isFinite(Number(item?.qty)))
          .map((item) => ({
            productId: item.productId,
            qty: Number(item.qty),
          })),
      };
    }
  } catch {
    return null;
  }

  return null;
}

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    const role = String(session?.user?.role ?? "").toUpperCase();
    if (!session?.user?.id || (role !== "ADMIN" && role !== "DRIVER")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const driverId = role === "DRIVER"
      ? session.user.id
      : (searchParams.get("driverId") ?? "").trim();
    if (!driverId) {
      return NextResponse.json({ error: "Жолооч сонгоно уу" }, { status: 400 });
    }

    const fromRaw = searchParams.get("fromDate") ?? todayKey();
    const toRaw = searchParams.get("toDate") ?? fromRaw;

    let fromStart = parseDayStart(fromRaw);
    let toStart = parseDayStart(toRaw);
    if (!fromStart || !toStart) {
      return NextResponse.json({ error: "Огнооны формат буруу" }, { status: 400 });
    }

    if (fromStart > toStart) {
      const tmp = fromStart;
      fromStart = toStart;
      toStart = tmp;
    }

    const toEnd = toDayEnd(toStart);

    const [driver, products, transfers, stockAuditLogs] = await Promise.all([
      prisma.user.findFirst({
        where: { id: driverId, role: "DRIVER", isActive: true },
        select: { id: true, name: true },
      }),
      prisma.product.findMany({
        where: { status: "ACTIVE" },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      prisma.inventoryTransfer.findMany({
        where: {
          createdAt: { lte: toEnd },
          OR: [{ toDriverId: driverId }, { fromDriverId: driverId }],
        },
        select: {
          createdAt: true,
          toDriverId: true,
          fromDriverId: true,
          items: {
            select: {
              productId: true,
              quantity: true,
            },
          },
        },
      }),
      prisma.orderAuditLog.findMany({
        where: {
          action: { in: ["DRIVER_STOCK_DEDUCTED", "DRIVER_STOCK_RESTORED"] },
          createdAt: { lte: toEnd },
          OR: [
            {
              newValue: {
                contains: `"driverId":"${driverId}"`,
              },
            },
            {
              AND: [
                {
                  newValue: {
                    not: {
                      contains: '"driverId":',
                    },
                  },
                },
                {
                  order: {
                    assignedToId: driverId,
                  },
                },
              ],
            },
          ],
        },
        select: {
          id: true,
          orderId: true,
          action: true,
          newValue: true,
          createdAt: true,
          userId: true,
        },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    if (!driver) {
      return NextResponse.json({ error: "Жолооч олдсонгүй" }, { status: 404 });
    }

    // For old-style orders where stock was deducted on assignment (reason=reserved/reserved_on_create/reserved_items_changed),
    // find when each order was actually delivered so we can count it on the correct day.
    const reservedOrderIds = stockAuditLogs
      .filter((log) => {
        if (log.action !== "DRIVER_STOCK_DEDUCTED") return false;
        let p: { reason?: unknown } | null = null;
        try { p = log.newValue ? (JSON.parse(log.newValue) as { reason?: unknown }) : null; } catch { return false; }
        const r = String(p?.reason ?? "").toLowerCase();
        return r === "reserved" || r === "reserved_on_create" || r === "reserved_items_changed";
      })
      .map((log) => log.orderId)
      .filter((id): id is string => Boolean(id));

    const deliveryStatusLogs = reservedOrderIds.length > 0
      ? await prisma.orderAuditLog.findMany({
          where: {
            action: "STATUS_CHANGED",
            newValue: "DELIVERED",
            orderId: { in: reservedOrderIds },
          },
          select: { orderId: true, createdAt: true },
          orderBy: { createdAt: "asc" },
        })
      : [];

    // Maps orderId → first time its status changed to DELIVERED
    const orderDeliveredAt = new Map<string, Date>();
    for (const dl of deliveryStatusLogs) {
      if (dl.orderId && !orderDeliveredAt.has(dl.orderId)) {
        orderDeliveredAt.set(dl.orderId, dl.createdAt);
      }
    }

    const events: MovementEvent[] = [];

    for (const transfer of transfers) {
      for (const item of transfer.items) {
        if (transfer.toDriverId === driverId) {
          events.push({
            createdAt: transfer.createdAt,
            productId: item.productId,
            delta: item.quantity,
            added: item.quantity,
            removed: 0,
          });
        }

        if (transfer.fromDriverId === driverId) {
          events.push({
            createdAt: transfer.createdAt,
            productId: item.productId,
            delta: -item.quantity,
            added: 0,
            removed: item.quantity,
          });
        }
      }
    }

    const orderDailyRemoved: Record<string, DailyProductTotals> = {};
    const deliveredBucketsByOrderProduct = new Map<string, Array<{ day: string; remainingQty: number }>>();

    for (const log of stockAuditLogs) {
      const parsed = extractStockAuditMovement(log.newValue, log.userId ?? null);
      if (!parsed || parsed.items.length === 0 || !log.orderId) {
        continue;
      }

      const belongsToDriver = parsed.driverId
        ? parsed.driverId === driverId
        : true;

      if (!belongsToDriver) {
        continue;
      }

      const payload = (() => {
        try {
          return log.newValue ? JSON.parse(log.newValue) as { reason?: unknown } : null;
        } catch {
          return null;
        }
      })();
      const reason = String(payload?.reason ?? "").toLowerCase();
      const isDeliveredDeduction = log.action === "DRIVER_STOCK_DEDUCTED"
        && (
          reason === "delivered"
          || reason === "delivered_items_changed"
          || reason === "driver_reassigned"
          || reason === ""
        );
      // Old-style: stock reserved at assignment — count on the delivery date
      const isReservedDeduction = log.action === "DRIVER_STOCK_DEDUCTED"
        && (reason === "reserved" || reason === "reserved_on_create" || reason === "reserved_items_changed");
      const isDeliveredRestoreAdjustment = log.action === "DRIVER_STOCK_RESTORED"
        && (
          reason === "cancelled"
          || reason === "released"
          || reason === "reserved_items_changed"
          || reason === "delivered_items_changed"
          || reason === "backfill_delivered_only_rule"
          || reason === "driver_reassigned" // cancels out a reserved deduction for reassigned orders
        );

      if (!isDeliveredDeduction && !isReservedDeduction && !isDeliveredRestoreAdjustment) {
        continue;
      }

      for (const item of parsed.items) {
        if (!item.productId || !Number.isFinite(item.qty) || item.qty <= 0) continue;

        const bucketKey = `${log.orderId}:${item.productId}`;

        if (isDeliveredDeduction || isReservedDeduction) {
          let day: string;
          if (isDeliveredDeduction) {
            day = toDayKey(log.createdAt);
          } else {
            // reserved deduction: use the date the order was actually delivered
            const deliveredAt = log.orderId ? orderDeliveredAt.get(log.orderId) : undefined;
            if (!deliveredAt) continue; // order was never delivered (or reassigned) — skip
            day = toDayKey(deliveredAt);
          }
          addDailyValue(orderDailyRemoved, day, item.productId, item.qty);

          const buckets = deliveredBucketsByOrderProduct.get(bucketKey) ?? [];
          buckets.push({ day, remainingQty: item.qty });
          deliveredBucketsByOrderProduct.set(bucketKey, buckets);
          continue;
        }

        let remainingToRestore = item.qty;
        const buckets = deliveredBucketsByOrderProduct.get(bucketKey) ?? [];
        while (remainingToRestore > 0 && buckets.length > 0) {
          const latestBucket = buckets[buckets.length - 1];
          const restoreQty = Math.min(latestBucket.remainingQty, remainingToRestore);
          subtractDailyValue(orderDailyRemoved, latestBucket.day, item.productId, restoreQty);

          latestBucket.remainingQty -= restoreQty;
          remainingToRestore -= restoreQty;
          if (latestBucket.remainingQty <= 0) {
            buckets.pop();
          }
        }

        if (buckets.length > 0) {
          deliveredBucketsByOrderProduct.set(bucketKey, buckets);
        } else {
          deliveredBucketsByOrderProduct.delete(bucketKey);
        }
      }
    }

    for (const [day, productTotals] of Object.entries(orderDailyRemoved)) {
      const eventDate = parseDayStart(day);
      if (!eventDate) continue;

      for (const [productId, removedQty] of Object.entries(productTotals)) {
        if (!Number.isFinite(removedQty) || removedQty <= 0) continue;
        events.push({
          createdAt: eventDate,
          productId,
          delta: -removedQty,
          added: 0,
          removed: removedQty,
        });
      }
    }

    const days: string[] = [];
    for (let cursor = fromStart; cursor <= toStart; cursor = addDays(cursor, 1)) {
      days.push(toDayKey(cursor));
    }

    const fromStartMs = fromStart.getTime();

    const openingBalanceByProduct: Record<string, number> = {};
    const dailyAdded: Record<string, Record<string, number>> = {};
    const dailyRemoved: Record<string, Record<string, number>> = {};

    for (const event of events) {
      const day = toDayKey(event.createdAt);
      const eventStart = parseDayStart(day);
      if (!eventStart) continue;

      if (eventStart.getTime() < fromStartMs) {
        openingBalanceByProduct[event.productId] = (openingBalanceByProduct[event.productId] ?? 0) + event.delta;
        continue;
      }

      if (!days.includes(day)) continue;

      if (!dailyAdded[day]) dailyAdded[day] = {};
      if (!dailyRemoved[day]) dailyRemoved[day] = {};

      dailyAdded[day][event.productId] = (dailyAdded[day][event.productId] ?? 0) + event.added;
      dailyRemoved[day][event.productId] = (dailyRemoved[day][event.productId] ?? 0) + event.removed;
    }

    const rows = products.map((product) => {
      let runningBalance = openingBalanceByProduct[product.id] ?? 0;

      const values = days.map((day) => {
        const added = dailyAdded[day]?.[product.id] ?? 0;
        const removed = dailyRemoved[day]?.[product.id] ?? 0;
        runningBalance += added - removed;

        return {
          day,
          added,
          removed,
          balance: runningBalance,
        };
      });

      return {
        productId: product.id,
        productName: product.name,
        values,
      };
    });

    return NextResponse.json({
      driver,
      fromDate: toDayKey(fromStart),
      toDate: toDayKey(toStart),
      days,
      rows,
    });
  } catch (error) {
    console.error("GET /api/stock/driver-movements failed", error);
    return NextResponse.json({ error: "Дэлгэрэнгүй хөдөлгөөний мэдээлэл авахад алдаа гарлаа" }, { status: 500 });
  }
}
