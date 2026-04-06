import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { generateSlug } from "@/lib/utils";

interface Params {
  id: string;
}

const productUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  categoryId: z.string().nullable().optional(),
  basePrice: z.coerce.number().min(0).optional(),
  status: z.enum(["ACTIVE", "DRAFT"]).optional(),
  description: z.string().optional(),
  images: z.array(z.string()).optional(),
});

function parseAuditItems(raw: string | null) {
  if (!raw) return [] as Array<{ productId: string; qty: number }>;

  try {
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object" && Array.isArray((parsed as { items?: unknown[] }).items)
        ? (parsed as { items: unknown[] }).items
        : [];

    return items
      .map((item: any) => ({
        productId: String(item?.productId ?? ""),
        qty: Number(item?.qty ?? 0),
      }))
      .filter((item: { productId: string; qty: number }) => item.productId && item.qty > 0);
  } catch {
    return [];
  }
}

function parseStockAuditMeta(raw: string | null): { reason: string | null } {
  if (!raw) return { reason: null };

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { reason: null };
    }

    return {
      reason: typeof (parsed as { reason?: unknown }).reason === "string"
        ? (parsed as { reason: string }).reason
        : null,
    };
  } catch {
    return { reason: null };
  }
}

async function generateUniqueSlugForUpdate(name: string, productId: string): Promise<string> {
  const baseSlug = generateSlug(name) || `product-${Date.now()}`;
  let candidate = baseSlug;
  let suffix = 2;

  while (true) {
    const existing = await prisma.product.findFirst({
      where: {
        slug: candidate,
        id: { not: productId },
      },
      select: { id: true },
    });

    if (!existing) return candidate;

    candidate = `${baseSlug}-${suffix}`;
    suffix++;
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<Params> }) {
  try {
    const { id } = await params;

    const [product, transferItems, salesLogs] = await Promise.all([
      prisma.product.findUnique({
        where: { id },
        include: {
          category: true,
          images: { orderBy: { sortOrder: "asc" } },
          inventory: true,
          driverStocks: {
            include: {
              driver: { select: { id: true, name: true } },
            },
            orderBy: { driver: { name: "asc" } },
          },
          priceHistory: { orderBy: { changedAt: "desc" }, take: 5 },
          stockMovements: {
            orderBy: { createdAt: "desc" },
            take: 50,
            include: {
              user: { select: { id: true, name: true } },
            },
          },
        },
      }),
      prisma.inventoryTransferItem.findMany({
        where: { productId: id },
        include: {
          transfer: {
            include: {
              createdBy: { select: { id: true, name: true } },
              fromDriver: { select: { id: true, name: true } },
              toDriver: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { transfer: { createdAt: "desc" } },
        take: 50,
      }),
      prisma.orderAuditLog.findMany({
        where: {
          action: { in: ["DRIVER_STOCK_DEDUCTED", "DRIVER_STOCK_RESTORED"] },
          newValue: { contains: id },
        },
        include: {
          user: { select: { id: true, name: true } },
          order: {
            select: {
              id: true,
              orderNumber: true,
              status: true,
              assignedTo: { select: { id: true, name: true } },
              customer: { select: { phone: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 200,
      }),
    ]);

    if (!product) {
      return NextResponse.json({ error: "Бараа олдсонгүй" }, { status: 404 });
    }

    return NextResponse.json({
      ...product,
      totalStock:
        (product.inventory?.quantity ?? 0) +
        product.driverStocks.reduce((sum, stock) => sum + stock.quantity, 0),
      transferHistory: transferItems.map((item) => ({
        id: item.id,
        quantity: item.quantity,
        createdAt: item.transfer.createdAt,
        note: item.transfer.note,
        createdBy: item.transfer.createdBy,
        fromType: item.transfer.fromType,
        toType: item.transfer.toType,
        fromDriver: item.transfer.fromDriver,
        toDriver: item.transfer.toDriver,
        referenceCode: item.transfer.referenceCode,
      })),
      salesHistory: salesLogs
        .map((log) => {
          const qty = parseAuditItems(log.newValue)
            .filter((item) => item.productId === id)
            .reduce((sum, item) => sum + item.qty, 0);

          if (qty <= 0) return null;

          const meta = parseStockAuditMeta(log.newValue);

          return {
            id: log.id,
            createdAt: log.createdAt,
            action: log.action,
            quantity: qty,
            reason: meta.reason,
            actor: log.user,
            driver: log.order.assignedTo,
            order: {
              id: log.order.id,
              orderNumber: log.order.orderNumber,
              phone: log.order.customer?.phone ?? null,
            },
          };
        })
        .filter(Boolean),
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Алдаа гарлаа" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<Params> }) {
  try {
    const { id } = await params;

    const session = await auth();
    if (session?.user?.role !== "ADMIN") {
      return NextResponse.json({ error: "Хандах эрх байхгүй" }, { status: 403 });
    }

    const body = await req.json();
    const parsed = productUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Буруу өгөгдөл" }, { status: 400 });
    }

    const currentProduct = await prisma.product.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!currentProduct) {
      return NextResponse.json({ error: "Бараа олдсонгүй" }, { status: 404 });
    }

    const { name, categoryId, basePrice, status, description, images } = parsed.data;

    const updateData: Prisma.ProductUpdateInput = {
      ...(typeof basePrice === "number" ? { basePrice: new Prisma.Decimal(basePrice) } : {}),
      ...(status ? { status } : {}),
      ...(typeof description === "string" ? { description } : {}),
      ...(categoryId !== undefined
        ? categoryId
          ? { category: { connect: { id: categoryId } } }
          : { category: { disconnect: true } }
        : {}),
    };

    if (name) {
      updateData.name = name;
      updateData.slug = await generateUniqueSlugForUpdate(name, id);
    }

    if (images) {
      updateData.images = {
        deleteMany: {},
        create: images.map((url, index) => ({
          url,
          isPrimary: index === 0,
          sortOrder: index,
        })),
      };
    }

    const product = await prisma.product.update({
      where: { id },
      data: updateData,
      include: {
        category: true,
        images: { orderBy: { sortOrder: "asc" } },
        inventory: true,
        driverStocks: {
          include: {
            driver: { select: { id: true, name: true } },
          },
          orderBy: { driver: { name: "asc" } },
        },
        stockMovements: {
          orderBy: { createdAt: "desc" },
          take: 50,
          include: {
            user: { select: { id: true, name: true } },
          },
        },
      },
    });

    const [transferItems, salesLogs] = await Promise.all([
      prisma.inventoryTransferItem.findMany({
        where: { productId: id },
        include: {
          transfer: {
            include: {
              createdBy: { select: { id: true, name: true } },
              fromDriver: { select: { id: true, name: true } },
              toDriver: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { transfer: { createdAt: "desc" } },
        take: 50,
      }),
      prisma.orderAuditLog.findMany({
        where: {
          action: { in: ["DRIVER_STOCK_DEDUCTED", "DRIVER_STOCK_RESTORED"] },
          newValue: { contains: id },
        },
        include: {
          user: { select: { id: true, name: true } },
          order: {
            select: {
              id: true,
              orderNumber: true,
              status: true,
              assignedTo: { select: { id: true, name: true } },
              customer: { select: { phone: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 200,
      }),
    ]);

    return NextResponse.json({
      ...product,
      totalStock:
        (product.inventory?.quantity ?? 0) +
        product.driverStocks.reduce((sum, stock) => sum + stock.quantity, 0),
      transferHistory: transferItems.map((item) => ({
        id: item.id,
        quantity: item.quantity,
        createdAt: item.transfer.createdAt,
        note: item.transfer.note,
        createdBy: item.transfer.createdBy,
        fromType: item.transfer.fromType,
        toType: item.transfer.toType,
        fromDriver: item.transfer.fromDriver,
        toDriver: item.transfer.toDriver,
        referenceCode: item.transfer.referenceCode,
      })),
      salesHistory: salesLogs
        .map((log) => {
          const qty = parseAuditItems(log.newValue)
            .filter((item) => item.productId === id)
            .reduce((sum, item) => sum + item.qty, 0);

          if (qty <= 0) return null;

          const meta = parseStockAuditMeta(log.newValue);

          return {
            id: log.id,
            createdAt: log.createdAt,
            action: log.action,
            quantity: qty,
            reason: meta.reason,
            actor: log.user,
            driver: log.order.assignedTo,
            order: {
              id: log.order.id,
              orderNumber: log.order.orderNumber,
              phone: log.order.customer?.phone ?? null,
            },
          };
        })
        .filter(Boolean),
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Алдаа гарлаа" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<Params> }) {
  try {
    const { id } = await params;

    const session = await auth();
    if (session?.user?.role !== "ADMIN") {
      return NextResponse.json({ error: "Хандах эрх байхгүй" }, { status: 403 });
    }

    const usedInOrders = await prisma.orderItem.count({
      where: { productId: id },
    });

    if (usedInOrders > 0) {
      return NextResponse.json(
        { error: "Энэ бараа захиалгад ашиглагдсан тул шууд устгах боломжгүй" },
        { status: 400 },
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.stockMovement.deleteMany({ where: { productId: id } });
      await tx.inventoryTransferItem.deleteMany({ where: { productId: id } });
      await tx.driverStock.deleteMany({ where: { productId: id } });
      await tx.priceHistory.deleteMany({ where: { productId: id } });
      await tx.productVariant.deleteMany({ where: { productId: id } });
      await tx.productImage.deleteMany({ where: { productId: id } });
      await tx.inventory.deleteMany({ where: { productId: id } });
      await tx.bundleItem.deleteMany({ where: { productId: id } });
      await tx.product.delete({ where: { id } });
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Алдаа гарлаа" }, { status: 500 });
  }
}
