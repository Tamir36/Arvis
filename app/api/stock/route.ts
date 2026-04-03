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

  const [drivers, products, driverStocks, deliveredItems] = await Promise.all([
    prisma.user.findMany({
      where: { role: "DRIVER", isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.product.findMany({
      select: {
        id: true,
        name: true,
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

  const rows = products.map((p) => {
    const driverBreakdown: Record<string, number> = Object.fromEntries(
      drivers.map((d) => [d.id, driverStockMap[p.id]?.[d.id] ?? 0])
    );
    const totalDriverQty = Object.values(driverBreakdown).reduce((a, b) => a + b, 0);
    return {
      id: p.id,
      name: p.name,
      category: p.category?.name ?? null,
      images: p.images,
      warehouseQty: p.inventory?.quantity ?? 0,
      driverBreakdown,
      totalDriverQty,
      totalDelivered: deliveredMap[p.id] ?? 0,
      totalRemaining: (p.inventory?.quantity ?? 0) + totalDriverQty,
    };
  });

  return NextResponse.json({ drivers, rows });
}
