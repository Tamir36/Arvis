import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { filterOrderIdsByDate, getLatestStatusChangesByOrder } from "@/lib/status-changes";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const REPORT_STATUSES = ["BLANK", "PENDING", "CONFIRMED", "DELIVERED", "CANCELLED", "RETURNED"] as const;
const CARRYOVER_STATUSES = new Set(["BLANK", "PENDING", "CONFIRMED", "RETURNED"]);
const HISTORICAL_EXCLUDED_CARRYOVER_STATUSES = ["BLANK", "PENDING", "CONFIRMED", "RETURNED"] as const;
const BUSINESS_UTC_OFFSET_MINUTES = 8 * 60;

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

function businessDateKey(date: Date): string {
  const shifted = new Date(date.getTime() + BUSINESS_UTC_OFFSET_MINUTES * 60 * 1000);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shortDayLabel(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function businessDayStart(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0) - BUSINESS_UTC_OFFSET_MINUTES * 60 * 1000);
}

function nextBusinessDay(date: Date): Date {
  return new Date(date.getTime() + 24 * 60 * 60 * 1000);
}

function businessTodayStart(date = new Date()): Date {
  const shifted = new Date(date.getTime() + BUSINESS_UTC_OFFSET_MINUTES * 60 * 1000);
  return businessDayStart(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate());
}

function buildDailyStatusWhere(params: {
  dayStart: Date;
  dayEnd: Date;
  todayStart: Date;
  deliveredOrderIds: string[];
  cancelledOrderIds: string[];
  returnedOrderIds: string[];
}): Prisma.OrderWhereInput {
  const { dayStart, dayEnd, todayStart, deliveredOrderIds, cancelledOrderIds, returnedOrderIds } = params;
  const includesToday = dayStart.getTime() === todayStart.getTime();
  const dateRange: Prisma.DateTimeFilter = {
    gte: dayStart,
    lte: dayEnd,
  };

  const deliveredInRangeFilter: Prisma.OrderWhereInput = {
    OR: [
      {
        AND: [
          { status: "DELIVERED" },
          { id: { in: deliveredOrderIds } },
        ],
      },
      {
        AND: [
          { status: "DELIVERED" },
          {
            auditLogs: {
              none: {
                action: "STATUS_CHANGED",
                newValue: "DELIVERED",
              },
            },
          },
          { updatedAt: dateRange },
        ],
      },
    ],
  };

  const cancelledInRangeFilter: Prisma.OrderWhereInput = {
    OR: [
      {
        AND: [
          { status: "CANCELLED" },
          { id: { in: cancelledOrderIds } },
        ],
      },
      {
        AND: [
          { status: "CANCELLED" },
          {
            auditLogs: {
              none: {
                action: "STATUS_CHANGED",
                newValue: "CANCELLED",
              },
            },
          },
          { updatedAt: dateRange },
        ],
      },
    ],
  };

  const returnedInRangeFilter: Prisma.OrderWhereInput = {
    OR: [
      {
        AND: [
          { status: "RETURNED" },
          { id: { in: returnedOrderIds } },
        ],
      },
      {
        AND: [
          { status: "RETURNED" },
          {
            delivery: {
              is: {
                timeSlot: {
                  is: {
                    date: dateRange,
                  },
                },
              },
            },
          },
        ],
      },
      {
        AND: [
          { status: "RETURNED" },
          {
            auditLogs: {
              none: {
                action: "STATUS_CHANGED",
                newValue: "RETURNED",
              },
            },
          },
          { updatedAt: dateRange },
        ],
      },
    ],
  };

  const nonTerminalStatusFilter: Prisma.OrderWhereInput = {
    status: { notIn: ["DELIVERED", "CANCELLED", "RETURNED"] as any },
  };

  const dateOrFilters: Prisma.OrderWhereInput[] = [
    deliveredInRangeFilter,
    cancelledInRangeFilter,
    returnedInRangeFilter,
    {
      ...nonTerminalStatusFilter,
      delivery: {
        is: {
          timeSlot: {
            is: {
              date: dateRange,
            },
          },
        },
      },
    },
    {
      AND: [
        {
          OR: [
            { delivery: { is: null } },
            { delivery: { is: { timeSlotId: null } } },
          ],
        },
        nonTerminalStatusFilter,
        {
          createdAt: dateRange,
        },
      ],
    },
  ];

  if (includesToday) {
    dateOrFilters.push({
      AND: [
        {
          status: { in: Array.from(CARRYOVER_STATUSES) as any },
        },
        {
          createdAt: { lt: todayStart },
        },
        {
          OR: [
            { delivery: { is: null } },
            { delivery: { is: { timeSlotId: null } } },
            {
              delivery: {
                is: {
                  timeSlot: {
                    is: {
                      date: { lt: todayStart },
                    },
                  },
                },
              },
            },
          ],
        },
      ],
    });
  }

  const andFilters: Prisma.OrderWhereInput[] = [{ OR: dateOrFilters }];

  if (!includesToday) {
    andFilters.push({
      status: { notIn: Array.from(HISTORICAL_EXCLUDED_CARRYOVER_STATUSES) as any },
    });
  }

  return { AND: andFilters };
}

export async function GET(req: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { year, month } = parseYearMonth(req);
    const monthStart = businessDayStart(year, month, 1);
    const days = new Date(year, month, 0).getDate();
    const monthLastDayStart = businessDayStart(year, month, days);
    const monthEnd = new Date(nextBusinessDay(monthLastDayStart).getTime() - 1);
    const todayStart = businessTodayStart();

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

    const [deliveredLatestLogs, cancelledLatestLogs, returnedLatestLogs, deliveredOrdersInMonth] = await Promise.all([
      getLatestStatusChangesByOrder(prisma, "DELIVERED"),
      getLatestStatusChangesByOrder(prisma, "CANCELLED"),
      getLatestStatusChangesByOrder(prisma, "RETURNED"),
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
      statusAmounts: Record<string, number>;
    }>();

    for (let day = 1; day <= days; day += 1) {
      const currentDate = new Date(year, month - 1, day);
      dailyMap.set(dateKey(currentDate), {
        dayLabel: shortDayLabel(currentDate),
        totalOrders: 0,
        revenue: 0,
        statuses: Object.fromEntries(REPORT_STATUSES.map((status) => [status, 0])),
        statusAmounts: Object.fromEntries(REPORT_STATUSES.map((status) => [status, 0])),
      });
    }

    for (let day = 1; day <= days; day += 1) {
      const dayStart = businessDayStart(year, month, day);
      const dayEnd = new Date(nextBusinessDay(dayStart).getTime() - 1);
      const key = businessDateKey(dayStart);
      const row = dailyMap.get(key);
      if (!row) continue;

      const dayWhere = buildDailyStatusWhere({
        dayStart,
        dayEnd,
        todayStart,
        deliveredOrderIds: filterOrderIdsByDate(deliveredLatestLogs, dayStart, dayEnd),
        cancelledOrderIds: filterOrderIdsByDate(cancelledLatestLogs, dayStart, dayEnd),
        returnedOrderIds: filterOrderIdsByDate(returnedLatestLogs, dayStart, dayEnd),
      });

      const dayOrders = await prisma.order.findMany({
        where: dayWhere,
        select: {
          status: true,
          total: true,
        },
      });

      for (const order of dayOrders) {
        const status = String(order.status).toUpperCase();
        if (!(status in row.statuses)) continue;
        row.totalOrders += 1;
        row.statuses[status] += 1;
        row.statusAmounts[status] += Number(order.total ?? 0);
      }
    }

    for (const order of deliveredOrdersInMonth) {
      const deliveredAt = latestDeliveredAtByOrder.get(order.id) ?? order.updatedAt;
      if (deliveredAt < monthStart || deliveredAt > monthEnd) continue;

      const key = businessDateKey(deliveredAt);
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
      ...Object.fromEntries(REPORT_STATUSES.map((status) => [`${status}Amount`, row.statusAmounts[status]])),
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
