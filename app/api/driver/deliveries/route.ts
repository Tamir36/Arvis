import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

const AUTO_ROLLOVER_STATUSES = ["PENDING", "CONFIRMED", "SHIPPED", "RETURNED"] as const;
const BUSINESS_TIME_ZONE = "Asia/Ulaanbaatar";

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

  await prisma.$transaction(async (tx) => {
    for (const assignment of overdueAssignments) {
      if (!assignment.timeSlot) continue;

      const nextSlot = await tx.timeSlot.create({
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

      await tx.deliveryAssignment.update({
        where: { id: assignment.id },
        data: { timeSlotId: nextSlot.id },
      });

      await tx.orderAuditLog.create({
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
      });
    }
  }, {
    maxWait: 45000,
    timeout: 45000,
  });
}

function parseDateKey(value: string | null): Date {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return startOfDay(new Date());
  }

  const [y, m, d] = value.split("-").map(Number);
  return startOfDay(new Date(Date.UTC(y, m - 1, d, 12, 0, 0, 0)));
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

    const [deliveries, driverStocks, stockHistory] = await Promise.all([
      prisma.order.findMany({
        where: {
          status: { not: "PENDING" },
          ...(isHistoricalDay ? { status: { notIn: [...AUTO_ROLLOVER_STATUSES] } } : {}),
          OR: [
            // Current driver assigned to order
            {
              assignedToId: session.user.id,
              OR: [
                {
                  delivery: {
                    is: {
                      timeSlot: {
                        is: {
                          date: {
                            gte: dayStart,
                            lte: dayEnd,
                          },
                        },
                      },
                    },
                  },
                },
                {
                  AND: [
                    { status: "RETURNED" },
                    { updatedAt: { gte: dayStart, lte: dayEnd } },
                  ],
                },
                {
                  AND: [
                    {
                      OR: [
                        { delivery: { is: null } },
                        { delivery: { is: { timeSlotId: null } } },
                      ],
                    },
                    { updatedAt: { gte: dayStart, lte: dayEnd } },
                  ],
                },
              ],
            },
            // Delivery agent assigned to order (even if assignedToId changed)
            {
              delivery: {
                is: {
                  agent: {
                    is: {
                      userId: session.user.id,
                    },
                  },
                  timeSlot: {
                    is: {
                      date: {
                        gte: dayStart,
                        lte: dayEnd,
                      },
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

    return NextResponse.json({
      selectedDate: `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, "0")}-${String(selectedDate.getDate()).padStart(2, "0")}`,
      deliveries,
      stocks: driverStocks,
      stockHistory,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Алдаа гарлаа" }, { status: 500 });
  }
}
