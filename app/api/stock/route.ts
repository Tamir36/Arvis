import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  const role = String(session?.user?.role ?? "").toUpperCase();
  if (!session || (role !== "ADMIN" && role !== "OPERATOR")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [drivers, products, driverStocks, deliveredItems, reservedItems] = await Promise.all([
    prisma.user.findMany({
      where: { role: "DRIVER", isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.product.findMany({
      select: {
        id: true,
        name: true,
        status: true,
        category: { select: { name: true } },
        images: {
          select: { url: true, isPrimary: true },
          orderBy: { isPrimary: "desc" },
          take: 1,
        },
        inventory: { select: { quantity: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.driverStock.findMany({
      select: { driverId: true, productId: true, quantity: true },
    }),
    prisma.orderItem.findMany({
      where: { order: { status: "DELIVERED" } },
      select: { productId: true, qty: true },
    }),
    prisma.orderItem.findMany({
      where: {
        order: {
          assignedToId: { not: null },
          status: { in: ["CONFIRMED"] },
        },
      },
      select: {
        productId: true,
        qty: true,
        order: {
          select: {
            assignedToId: true,
          },
        },
      },
    }),
  ]);

  // Build lookup maps
  const deliveredMap: Record<string, number> = {};
  for (const item of deliveredItems) {
    deliveredMap[item.productId] = (deliveredMap[item.productId] ?? 0) + item.qty;
  }

  const driverStockMap: Record<string, Record<string, number>> = {};
  for (const ds of driverStocks) {
    if (!driverStockMap[ds.productId]) driverStockMap[ds.productId] = {};
    driverStockMap[ds.productId][ds.driverId] = ds.quantity;
  }

  const driverReservedMap: Record<string, Record<string, number>> = {};
  for (const item of reservedItems) {
    const driverId = item.order.assignedToId;
    if (!driverId) continue;
    if (!driverReservedMap[item.productId]) driverReservedMap[item.productId] = {};
    driverReservedMap[item.productId][driverId] = (driverReservedMap[item.productId][driverId] ?? 0) + item.qty;
  }

  const rows = products.map((p) => {
    const driverBreakdown: Record<string, number> = Object.fromEntries(
      drivers.map((d) => [d.id, driverStockMap[p.id]?.[d.id] ?? 0])
    );
    const totalDriverQty = Object.values(driverBreakdown).reduce((a, b) => a + b, 0);
    const driverReservedBreakdown: Record<string, number> = Object.fromEntries(
      drivers.map((d) => [d.id, driverReservedMap[p.id]?.[d.id] ?? 0]),
    );
    return {
      id: p.id,
      name: p.name,
      status: p.status,
      category: p.category?.name ?? null,
      images: p.images,
      warehouseQty: p.inventory?.quantity ?? 0,
      driverBreakdown,
      driverReservedBreakdown,
      totalDriverQty,
      totalDelivered: deliveredMap[p.id] ?? 0,
      totalRemaining: (p.inventory?.quantity ?? 0) + totalDriverQty,
    };
  });

  return NextResponse.json({ drivers, rows });
}
