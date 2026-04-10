import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

const REPORT_STATUSES = ["PENDING", "CONFIRMED", "PACKED", "SHIPPED", "DELIVERED", "CANCELLED", "RETURNED"] as const;

function parseYearMonth(req: NextRequest): { year: number; month: number } {
  const now = new Date();
  const yearParam = Number(req.nextUrl.searchParams.get("year"));
  const monthParam = Number(req.nextUrl.searchParams.get("month"));

  const year = Number.isInteger(yearParam) && yearParam >= 2020 && yearParam <= 2100
    ? yearParam
    : now.getFullYear();
  const month = Number.isInteger(monthParam) && monthParam >= 1 && monthParam <= 12
    ? monthParam
    : now.getMonth() + 1;

  return { year, month };
}

function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shortDayLabel(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

export async function GET(req: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { year, month } = parseYearMonth(req);
    const monthStart = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);
    const days = new Date(year, month, 0).getDate();

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

    const [ordersInMonth, deliveredOrdersInMonth] = await Promise.all([
      prisma.order.findMany({
        where: {
          createdAt: { gte: monthStart, lte: monthEnd },
        },
        select: {
          status: true,
          total: true,
          createdAt: true,
        },
      }),
      prisma.order.findMany({
        where: {
          status: "DELIVERED",
          OR: [
            { updatedAt: { gte: monthStart, lte: monthEnd } },
            {
              auditLogs: {
                some: {
                  action: "STATUS_CHANGED",
                  newValue: "DELIVERED",
                  createdAt: { gte: monthStart, lte: monthEnd },
                },
              },
            },
          ],
        },
        select: {
          id: true,
          total: true,
          updatedAt: true,
        },
      }),
    ]);

    const deliveredOrderIds = deliveredOrdersInMonth.map((order) => order.id);
    const deliveredLogs = deliveredOrderIds.length > 0
      ? await prisma.orderAuditLog.findMany({
          where: {
            action: "STATUS_CHANGED",
            newValue: "DELIVERED",
            orderId: { in: deliveredOrderIds },
          },
          select: {
            orderId: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
        })
      : [];

    const latestDeliveredAtByOrder = new Map<string, Date>();
    for (const log of deliveredLogs) {
      if (!latestDeliveredAtByOrder.has(log.orderId)) {
        latestDeliveredAtByOrder.set(log.orderId, log.createdAt);
      }
    }

    const dailyMap = new Map<string, {
      dayLabel: string;
      totalOrders: number;
      revenue: number;
      statuses: Record<string, number>;
    }>();

    for (let day = 1; day <= days; day += 1) {
      const currentDate = new Date(year, month - 1, day);
      dailyMap.set(dateKey(currentDate), {
        dayLabel: shortDayLabel(currentDate),
        totalOrders: 0,
        revenue: 0,
        statuses: Object.fromEntries(REPORT_STATUSES.map((status) => [status, 0])),
      });
    }

    for (const order of ordersInMonth) {
      const key = dateKey(order.createdAt);
      const row = dailyMap.get(key);
      if (!row) continue;

      row.totalOrders += 1;
      const status = String(order.status).toUpperCase();
      if (status in row.statuses) {
        row.statuses[status] += 1;
      }
    }

    for (const order of deliveredOrdersInMonth) {
      const deliveredAt = latestDeliveredAtByOrder.get(order.id) ?? order.updatedAt;
      if (deliveredAt < monthStart || deliveredAt > monthEnd) continue;

      const key = dateKey(deliveredAt);
      const row = dailyMap.get(key);
      if (!row) continue;

      row.revenue += Number(order.total);
    }

    const monthlyData = Array.from(dailyMap.values()).map((row) => ({
      day: row.dayLabel,
      revenue: row.revenue,
      totalOrders: row.totalOrders,
    }));

    const statusData = Array.from(dailyMap.values()).map((row) => ({
      day: row.dayLabel,
      ...row.statuses,
    }));

    return NextResponse.json({
      totalOrders,
      totalProducts,
      totalCustomers,
      totalRevenue: Number(totalRevenue._sum.total ?? 0),
      recentOrders,
      lowStockProducts,
      monthlyData,
      statusData,
      selectedYear: year,
      selectedMonth: month,
    });
  } catch (error) {
    console.error("Dashboard API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch dashboard data" },
      { status: 500 }
    );
  }
}
