import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { InventoryLocationType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

const transferItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().int().positive(),
});

const transferSchema = z
  .object({
    fromType: z.nativeEnum(InventoryLocationType),
    fromDriverId: z.string().nullish(),
    toType: z.nativeEnum(InventoryLocationType),
    toDriverId: z.string().nullish(),
    note: z.string().trim().max(500).optional().or(z.literal("")),
    items: z.array(transferItemSchema).min(1),
  })
  .superRefine((value, ctx) => {
    if (value.fromType === InventoryLocationType.DRIVER && !value.fromDriverId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Эх үүсвэр жолооч сонгоно уу", path: ["fromDriverId"] });
    }
    if (value.toType === InventoryLocationType.DRIVER && !value.toDriverId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Хүлээн авагч жолооч сонгоно уу", path: ["toDriverId"] });
    }
    if (value.fromType === InventoryLocationType.WAREHOUSE && value.toType === InventoryLocationType.WAREHOUSE) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Агуулахаас агуулах руу шилжүүлэх боломжгүй" });
    }
    if (
      value.fromType === value.toType &&
      value.fromType === InventoryLocationType.DRIVER &&
      value.fromDriverId &&
      value.fromDriverId === value.toDriverId
    ) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Ижил жолооч руу шилжүүлэх боломжгүй" });
    }
  });

function getLocationLabel(type: InventoryLocationType, driverName?: string | null) {
  return type === InventoryLocationType.WAREHOUSE ? "Агуулах" : driverName ?? "Жолооч";
}

async function requireStockAccess() {
  const session = await auth();
  const role = String(session?.user?.role ?? "").toUpperCase();
  if (!session || (role !== "ADMIN" && role !== "OPERATOR")) {
    return null;
  }
  return session;
}

export async function GET() {
  const session = await requireStockAccess();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [drivers, products, driverStocks, transfers] = await Promise.all([
    prisma.user.findMany({
      where: { role: "DRIVER", isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.product.findMany({
      select: { id: true, name: true, inventory: { select: { quantity: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.driverStock.findMany({
      select: { driverId: true, productId: true, quantity: true },
    }),
    prisma.inventoryTransfer.findMany({
      include: {
        createdBy: { select: { id: true, name: true } },
        fromDriver: { select: { id: true, name: true } },
        toDriver: { select: { id: true, name: true } },
        items: {
          include: {
            product: { select: { id: true, name: true } },
          },
          orderBy: { product: { name: "asc" } },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  const driverStockMap: Record<string, Record<string, number>> = {};
  for (const stock of driverStocks) {
    if (!driverStockMap[stock.productId]) {
      driverStockMap[stock.productId] = {};
    }
    driverStockMap[stock.productId][stock.driverId] = stock.quantity;
  }

  const serializedTransfers = transfers.map((transfer) => ({
    id: transfer.id,
    referenceCode: transfer.referenceCode,
    createdAt: transfer.createdAt,
    note: transfer.note,
    createdBy: transfer.createdBy,
    fromLabel: getLocationLabel(transfer.fromType, transfer.fromDriver?.name),
    toLabel: getLocationLabel(transfer.toType, transfer.toDriver?.name),
    items: transfer.items.map((item) => ({
      id: item.id,
      quantity: item.quantity,
      product: item.product,
    })),
  }));

  return NextResponse.json({
    drivers,
    products: products.map((product) => ({
      id: product.id,
      name: product.name,
      warehouseQty: product.inventory?.quantity ?? 0,
      driverBreakdown: Object.fromEntries(
        drivers.map((driver) => [driver.id, driverStockMap[product.id]?.[driver.id] ?? 0])
      ),
    })),
    transfers: serializedTransfers,
  });
}

export async function POST(req: NextRequest) {
  const session = await requireStockAccess();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const parsed = transferSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Буруу өгөгдөл" }, { status: 400 });
    }

    const normalizedItems = Array.from(
      parsed.data.items.reduce((map, item) => {
        map.set(item.productId, (map.get(item.productId) ?? 0) + item.quantity);
        return map;
      }, new Map<string, number>())
    ).map(([productId, quantity]) => ({ productId, quantity }));

    const productIds = normalizedItems.map((item) => item.productId);
    const driverIds = [parsed.data.fromDriverId, parsed.data.toDriverId].filter(Boolean) as string[];

    const result = await prisma.$transaction(
      async (tx) => {
        const [products, driverStocks] = await Promise.all([
          tx.product.findMany({
            where: { id: { in: productIds } },
            include: { inventory: true },
          }),
          driverIds.length > 0
            ? tx.driverStock.findMany({ where: { driverId: { in: driverIds }, productId: { in: productIds } } })
            : Promise.resolve([]),
        ]);

        const productMap = new Map(products.map((product) => [product.id, product]));
        const driverStockMap = new Map(driverStocks.map((stock) => [`${stock.driverId}:${stock.productId}`, stock]));

        for (const item of normalizedItems) {
          const product = productMap.get(item.productId);
          if (!product) {
            throw new Error("PRODUCT_NOT_FOUND");
          }

          if (parsed.data.fromType === InventoryLocationType.WAREHOUSE) {
            const currentQty = product.inventory?.quantity ?? 0;
            if (currentQty < item.quantity) {
              throw new Error(`WAREHOUSE_STOCK:${product.name}`);
            }
          }

          if (parsed.data.fromType === InventoryLocationType.DRIVER && parsed.data.fromDriverId) {
            const sourceStock = driverStockMap.get(`${parsed.data.fromDriverId}:${item.productId}`)?.quantity ?? 0;
            if (sourceStock < item.quantity) {
              throw new Error(`DRIVER_STOCK:${product.name}`);
            }
          }
        }

        for (const item of normalizedItems) {
          const product = productMap.get(item.productId)!;

          if (parsed.data.fromType === InventoryLocationType.WAREHOUSE) {
            await tx.inventory.upsert({
              where: { productId: item.productId },
              update: { quantity: { decrement: item.quantity } },
              create: { productId: item.productId, quantity: -item.quantity },
            });
          }

          if (parsed.data.fromType === InventoryLocationType.DRIVER && parsed.data.fromDriverId) {
            const source = driverStockMap.get(`${parsed.data.fromDriverId}:${item.productId}`);
            if (!source) {
              throw new Error(`DRIVER_STOCK:${product.name}`);
            }
            await tx.driverStock.update({
              where: { id: source.id },
              data: { quantity: { decrement: item.quantity } },
            });
          }

          if (parsed.data.toType === InventoryLocationType.WAREHOUSE) {
            await tx.inventory.upsert({
              where: { productId: item.productId },
              update: { quantity: { increment: item.quantity } },
              create: { productId: item.productId, quantity: item.quantity },
            });
          }

          if (parsed.data.toType === InventoryLocationType.DRIVER && parsed.data.toDriverId) {
            await tx.driverStock.upsert({
              where: {
                driverId_productId: {
                  driverId: parsed.data.toDriverId,
                  productId: item.productId,
                },
              },
              update: { quantity: { increment: item.quantity } },
              create: {
                driverId: parsed.data.toDriverId,
                productId: item.productId,
                quantity: item.quantity,
              },
            });
          }
        }

        const transfer = await tx.inventoryTransfer.create({
          data: {
            referenceCode: `MV-${Date.now()}`,
            createdById: session.user.id,
            fromType: parsed.data.fromType,
            fromDriverId: parsed.data.fromType === InventoryLocationType.DRIVER ? parsed.data.fromDriverId : null,
            toType: parsed.data.toType,
            toDriverId: parsed.data.toType === InventoryLocationType.DRIVER ? parsed.data.toDriverId : null,
            note: parsed.data.note || null,
            items: {
              create: normalizedItems.map((item) => ({
                productId: item.productId,
                quantity: item.quantity,
              })),
            },
          },
          include: {
            createdBy: { select: { id: true, name: true } },
            fromDriver: { select: { id: true, name: true } },
            toDriver: { select: { id: true, name: true } },
            items: {
              include: { product: { select: { id: true, name: true } } },
              orderBy: { product: { name: "asc" } },
            },
          },
        });

        return transfer;
      },
      {
        maxWait: 45000,
        timeout: 45000,
      }
    );

    return NextResponse.json({
      id: result.id,
      referenceCode: result.referenceCode,
      createdAt: result.createdAt,
      note: result.note,
      createdBy: result.createdBy,
      fromLabel: getLocationLabel(result.fromType, result.fromDriver?.name),
      toLabel: getLocationLabel(result.toType, result.toDriver?.name),
      items: result.items.map((item) => ({ id: item.id, quantity: item.quantity, product: item.product })),
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "PRODUCT_NOT_FOUND") {
        return NextResponse.json({ error: "Бараа олдсонгүй" }, { status: 404 });
      }
      if (error.message.startsWith("WAREHOUSE_STOCK:")) {
        return NextResponse.json({ error: `${error.message.replace("WAREHOUSE_STOCK:", "")} барааны агуулахын үлдэгдэл хүрэлцэхгүй` }, { status: 400 });
      }
      if (error.message.startsWith("DRIVER_STOCK:")) {
        return NextResponse.json({ error: `${error.message.replace("DRIVER_STOCK:", "")} барааны жолоочийн үлдэгдэл хүрэлцэхгүй` }, { status: 400 });
      }
    }

    console.error(error);
    return NextResponse.json({ error: "Шилжилт хадгалахад алдаа гарлаа" }, { status: 500 });
  }
}
