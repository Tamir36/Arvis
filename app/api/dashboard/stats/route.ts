import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const [
      totalOrders,
      totalProducts,
      totalCustomers,
      recentOrders,
      lowStockProducts,
      totalRevenue,
    ] = await Promise.all([
      prisma.order.count(),
      prisma.product.count({ where: { status: "ACTIVE" } }),
      prisma.customer.count(),
      prisma.order.findMany({
        take: 6,
        orderBy: { createdAt: "desc" },
        include: {
          customer: { select: { name: true, phone: true } },
        },
      }),
      prisma.inventory.findMany({
        where: {
          quantity: { lte: 10 },
        },
        include: { product: { select: { name: true } } },
        take: 5,
      }),
      prisma.order.aggregate({
        _sum: { total: true },
        where: { paymentStatus: "PAID" },
      }),
    ]);

    // Monthly revenue for chart (last 6 months)
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const start = new Date(date.getFullYear(), date.getMonth(), 1);
      const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);

      const revenue = await prisma.order.aggregate({
        _sum: { total: true },
        where: {
          createdAt: { gte: start, lte: end },
          paymentStatus: "PAID",
        },
      });

      months.push({
        month: `${date.getMonth() + 1}-р сар`,
        revenue: Number(revenue._sum.total ?? 0),
        orders: await prisma.order.count({
          where: { createdAt: { gte: start, lte: end } },
        }),
      });
    }

    // Order status distribution
    const statusCounts = await prisma.order.groupBy({
      by: ["status"],
      _count: { id: true },
    });

    return NextResponse.json({
      totalOrders,
      totalProducts,
      totalCustomers,
      totalRevenue: Number(totalRevenue._sum.total ?? 0),
      recentOrders,
      lowStockProducts,
      monthlyData: months,
      statusData: statusCounts.map((s) => ({
        name: s.status,
        value: s._count.id,
      })),
    });
  } catch (error) {
    console.error("Dashboard API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch dashboard data" },
      { status: 500 }
    );
  }
}
