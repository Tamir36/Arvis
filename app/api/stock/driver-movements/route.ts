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

    const [driver, products, transfers, deliveredLatestLogs] = await Promise.all([
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
      prisma.orderAuditLog.groupBy({
        by: ["orderId"],
        where: {
          action: "STATUS_CHANGED",
          newValue: "DELIVERED",
          createdAt: { lte: toEnd },
          order: {
            assignedToId: driverId,
            status: "DELIVERED",
          },
        },
        _max: {
          createdAt: true,
        },
      }),
    ]);

    if (!driver) {
      return NextResponse.json({ error: "Жолооч олдсонгүй" }, { status: 404 });
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

    const deliveredLogConditions = deliveredLatestLogs
      .map((entry) => {
        if (!entry._max.createdAt) return null;
        return {
          orderId: entry.orderId,
          createdAt: entry._max.createdAt,
        };
      })
      .filter((entry): entry is { orderId: string; createdAt: Date } => entry !== null);

    const deliveredLogs = deliveredLogConditions.length > 0
      ? await prisma.orderAuditLog.findMany({
          where: {
            action: "STATUS_CHANGED",
            newValue: "DELIVERED",
            OR: deliveredLogConditions,
          },
          select: {
            orderId: true,
            createdAt: true,
            order: {
              select: {
                items: {
                  select: {
                    productId: true,
                    qty: true,
                  },
                },
              },
            },
          },
        })
      : [];

    const countedDeliveredOrders = new Set<string>();
    for (const log of deliveredLogs) {
      if (countedDeliveredOrders.has(log.orderId)) {
        continue;
      }
      countedDeliveredOrders.add(log.orderId);

      for (const item of log.order.items) {
        if (!item.productId || !Number.isFinite(item.qty) || item.qty <= 0) continue;

        events.push({
          createdAt: log.createdAt,
          productId: item.productId,
          delta: -item.qty,
          added: 0,
          removed: item.qty,
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
