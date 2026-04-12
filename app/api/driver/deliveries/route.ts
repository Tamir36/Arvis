import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

const AUTO_ROLLOVER_STATUSES = ["PENDING", "CONFIRMED", "SHIPPED", "RETURNED"] as const;
const BUSINESS_TIME_ZONE = "Asia/Ulaanbaatar";
const TERMINAL_STATUSES = ["DELIVERED", "RETURNED", "CANCELLED"] as const;

function startOfDay(date: Date): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = Number(parts.find((part) => part.type === "year")?.value ?? "0");
  const month = Number(parts.find((part) => part.type === "month")?.value ?? "1");
  const day = Number(parts.find((part) => part.type === "day")?.value ?? "1");

  const utcMidnight = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  const tzAtUtcMidnight = new Date(utcMidnight.toLocaleString("en-US", { timeZone: BUSINESS_TIME_ZONE }));
  const offsetMs = tzAtUtcMidnight.getTime() - utcMidnight.getTime();
  return new Date(utcMidnight.getTime() - offsetMs);
}

function nextDay(date: Date): Date {
  return new Date(date.getTime() + 24 * 60 * 60 * 1000);
}

async function rolloverDriverOpenDeliveriesToToday(driverUserId: string) {
  const today = startOfDay(new Date());

  const overdueAssignments = await prisma.deliveryAssignment.findMany({
    where: {
      OR: [
        { order: { assignedToId: driverUserId } },
        { agent: { userId: driverUserId } },
      ],
      order: {
        status: { in: [...AUTO_ROLLOVER_STATUSES] },
      },
      timeSlot: {
        date: { lt: today },
      },
    },
    select: {
      id: true,
      orderId: true,
      status: true,
      order: {
        select: {
          status: true,
        },
      },
      timeSlot: {
        select: {
          date: true,
          startTime: true,
          endTime: true,
          maxOrders: true,
          zone: true,
          isActive: true,
        },
      },
    },
    take: 200,
  });

  if (overdueAssignments.length === 0) {
    return;
  }

  const slotCache = new Map<string, string>();

  for (const assignment of overdueAssignments) {
    if (!assignment.timeSlot) continue;

    const slotKey = [
      today.toISOString().slice(0, 10),
      assignment.timeSlot.startTime,
      assignment.timeSlot.endTime,
      assignment.timeSlot.maxOrders,
      assignment.timeSlot.zone,
      assignment.timeSlot.isActive ? "1" : "0",
    ].join("|");

    let nextSlotId = slotCache.get(slotKey) ?? null;

    if (!nextSlotId) {
      const existing = await prisma.timeSlot.findFirst({
        where: {
          date: today,
          startTime: assignment.timeSlot.startTime,
          endTime: assignment.timeSlot.endTime,
          maxOrders: assignment.timeSlot.maxOrders,
          zone: assignment.timeSlot.zone,
          isActive: assignment.timeSlot.isActive,
        },
        select: { id: true },
      });

      if (existing) {
        nextSlotId = existing.id;
      } else {
        const created = await prisma.timeSlot.create({
          data: {
            date: today,
            startTime: assignment.timeSlot.startTime,
            endTime: assignment.timeSlot.endTime,
            maxOrders: assignment.timeSlot.maxOrders,
            zone: assignment.timeSlot.zone,
            isActive: assignment.timeSlot.isActive,
            bookedCount: 0,
          },
          select: { id: true },
        });
        nextSlotId = created.id;
      }

      slotCache.set(slotKey, nextSlotId);
    }

    await prisma.$transaction([
      prisma.deliveryAssignment.update({
        where: { id: assignment.id },
        data: { timeSlotId: nextSlotId },
      }),
      prisma.orderAuditLog.create({
        data: {
          orderId: assignment.orderId,
          userId: driverUserId,
          action: "DELIVERY_DATE_ROLLED_OVER",
          oldValue: assignment.timeSlot.date.toISOString(),
          newValue: JSON.stringify({
            fromDate: assignment.timeSlot.date.toISOString(),
            toDate: today.toISOString(),
            status: assignment.order.status,
            reason: "driver_deliveries_daily_rollover",
          }),
        },
      }),
    ]);
  }
}

function parseDateKey(value: string | null): Date {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return startOfDay(new Date());
  }

  const [y, m, d] = value.split("-").map(Number);
  return startOfDay(new Date(Date.UTC(y, m - 1, d, 12, 0, 0, 0)));
}

function getLatestStatusChangeAt(
  auditLogs: Array<{ newValue: string | null; createdAt: Date }>,
  status: string,
) {
  const match = auditLogs.find((log) => String(log.newValue ?? "").toUpperCase() === status);
  return match?.createdAt ?? null;
}

function getEffectiveDeliveryDate(order: {
  status: string;
  updatedAt: Date;
  delivery: { timeSlot: { date: Date } | null } | null;
  auditLogs: Array<{ newValue: string | null; createdAt: Date }>;
}, todayStart: Date) {
  const status = String(order.status).toUpperCase();
  const slotDate = order.delivery?.timeSlot?.date ?? null;
  const tomorrowStart = nextDay(todayStart);

  if (status === "RETURNED") {
    const returnedAt = getLatestStatusChangeAt(order.auditLogs, status);

    if (returnedAt && returnedAt >= todayStart && returnedAt < tomorrowStart) {
      return returnedAt;
    }

    return slotDate ?? returnedAt ?? order.updatedAt;
  }

  if (status === "DELIVERED" || status === "CANCELLED") {
    return getLatestStatusChangeAt(order.auditLogs, status) ?? slotDate ?? order.updatedAt;
  }

  return slotDate ?? order.updatedAt;
}

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Нэвтрэх шаардлагатай" }, { status: 401 });
    }

    const role = String(session.user.role ?? "").toUpperCase();
    if (role !== "DRIVER") {
      return NextResponse.json({ error: "Зөвхөн жолооч хандах боломжтой" }, { status: 403 });
    }

    await rolloverDriverOpenDeliveriesToToday(session.user.id);

    const { searchParams } = new URL(req.url);
    const selectedDate = parseDateKey(searchParams.get("date"));
    const dayStart = selectedDate;
    const dayEnd = new Date(nextDay(dayStart).getTime() - 1);
    const todayStart = startOfDay(new Date());
    const isHistoricalDay = dayEnd < todayStart;

    const [rawDeliveries, driverStocks, stockHistory] = await Promise.all([
      prisma.order.findMany({
        where: {
          status: { not: "PENDING" },
          OR: [
            {
              assignedToId: session.user.id,
            },
            {
              delivery: {
                is: {
                  agent: {
                    is: {
                      userId: session.user.id,
                    },
                  },
                },
              },
            },
          ],
        },
        include: {
          customer: {
            select: {
              id: true,
              name: true,
              phone: true,
              address: true,
            },
          },
          items: {
            select: {
              id: true,
              name: true,
              qty: true,
              unitPrice: true,
            },
          },
          delivery: {
            include: {
              timeSlot: {
                select: {
                  date: true,
                },
              },
            },
          },
          auditLogs: {
            where: {
              action: "STATUS_CHANGED",
              newValue: { in: [...TERMINAL_STATUSES] },
            },
            select: {
              newValue: true,
              createdAt: true,
            },
            orderBy: { createdAt: "desc" },
          },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.driverStock.findMany({
        where: { driverId: session.user.id },
        include: {
          product: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: {
          product: {
            name: "asc",
          },
        },
      }),
      prisma.orderAuditLog.findMany({
        where: {
          action: { in: ["DRIVER_STOCK_DEDUCTED", "DRIVER_STOCK_RESTORED"] },
          order: {
            assignedToId: session.user.id,
          },
        },
        include: {
          order: {
            select: {
              id: true,
              orderNumber: true,
              customer: {
                select: {
                  name: true,
                  phone: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
    ]);

    const deliveries = rawDeliveries
      .map((order) => {
        const effectiveDate = getEffectiveDeliveryDate(order, todayStart);

        return {
          ...order,
          effectiveDate,
        };
      })
      .filter((order) => {
        const status = String(order.status).toUpperCase();
        if (isHistoricalDay && AUTO_ROLLOVER_STATUSES.includes(status as (typeof AUTO_ROLLOVER_STATUSES)[number])) {
          return false;
        }

        return order.effectiveDate >= dayStart && order.effectiveDate <= dayEnd;
      })
      .sort((left, right) => left.effectiveDate.getTime() - right.effectiveDate.getTime())
      .map(({ effectiveDate, auditLogs, ...order }) => ({
        ...order,
        effectiveDate: effectiveDate.toISOString(),
      }));

    return NextResponse.json({
      selectedDate: searchParams.get("date") ?? `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, "0")}-${String(selectedDate.getDate()).padStart(2, "0")}`,
      deliveries,
      stocks: driverStocks,
      stockHistory,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Алдаа гарлаа" }, { status: 500 });
  }
}
