import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getOrderIdsWithLatestStatusInRange } from "@/lib/status-changes";

const BUSINESS_UTC_OFFSET_MINUTES = 8 * 60;

function businessDayStart(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0) - BUSINESS_UTC_OFFSET_MINUTES * 60 * 1000);
}

function nextBusinessDay(date: Date): Date {
  return new Date(date.getTime() + 24 * 60 * 60 * 1000);
}

function parseDateStart(value: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const [y, m, d] = value.split("-").map(Number);
  return businessDayStart(y, m, d);
}

function businessTodayStart(date = new Date()): Date {
  const shifted = new Date(date.getTime() + BUSINESS_UTC_OFFSET_MINUTES * 60 * 1000);
  return businessDayStart(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate());
}

export async function GET(request: Request) {
  const session = await auth();
  const role = String(session?.user?.role ?? "").toUpperCase();

  if (!session || !["ADMIN", "OPERATOR"].includes(role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const dateParam = searchParams.get("date");
  let fromDateValue = parseDateStart(searchParams.get("fromDate") ?? dateParam);
  let toDateValue = parseDateStart(searchParams.get("toDate") ?? dateParam);

  if (!fromDateValue && !toDateValue) {
    const today = businessTodayStart();
    fromDateValue = today;
    toDateValue = today;
  } else if (!fromDateValue && toDateValue) {
    fromDateValue = toDateValue;
  } else if (fromDateValue && !toDateValue) {
    toDateValue = fromDateValue;
  }

  if (!fromDateValue || !toDateValue) {
    return NextResponse.json({ error: "Огноо буруу байна" }, { status: 400 });
  }

  if (fromDateValue > toDateValue) {
    const tmp = fromDateValue;
    fromDateValue = toDateValue;
    toDateValue = tmp;
  }

  const dayStart = fromDateValue;
  const dayEnd = new Date(nextBusinessDay(toDateValue).getTime() - 1);

  const deliveredOrderIds = await getOrderIdsWithLatestStatusInRange(prisma, "DELIVERED", {
    gte: dayStart,
    lte: dayEnd,
  });

  if (deliveredOrderIds.length === 0) {
    return NextResponse.json({ data: [], fromDate: dayStart.toISOString(), toDate: dayEnd.toISOString() });
  }

  const deliveredOrders = await prisma.order.findMany({
    where: {
      status: "DELIVERED",
      id: { in: deliveredOrderIds },
    },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      total: true,
      customer: { select: { name: true, phone: true } },
      items: {
        select: {
          name: true,
          qty: true,
          total: true,
        },
      },
      updatedAt: true,
    },
    orderBy: { updatedAt: "asc" },
  });

  const orderIds = deliveredOrders.map((order) => order.id);

  const driverAssignmentLogs = orderIds.length > 0
    ? await prisma.orderAuditLog.findMany({
        where: {
          orderId: { in: orderIds },
          action: "DRIVER_CHANGED",
          user: { role: "OPERATOR" },
          ...(role === "OPERATOR" ? { userId: session.user.id } : {}),
          NOT: [
            { newValue: null },
            { newValue: "" },
          ],
        },
        select: {
          orderId: true,
          createdAt: true,
          user: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "asc" },
      })
    : [];

  const firstAssignmentByOrder = new Map<
    string,
    { operatorId: string; operatorName: string; assignedAt: Date }
  >();

  for (const log of driverAssignmentLogs) {
    if (!firstAssignmentByOrder.has(log.orderId)) {
      firstAssignmentByOrder.set(log.orderId, {
        operatorId: log.user.id,
        operatorName: log.user.name,
        assignedAt: log.createdAt,
      });
    }
  }

  const operatorMap = new Map<
    string,
    {
      operatorId: string;
      operatorName: string;
      orders: {
        orderId: string;
        orderNumber: string;
        status: string;
        total: number;
        customerName: string;
        customerPhone: string;
        items: { name: string; qty: number; total: number }[];
        createdAt: Date;
      }[];
    }
  >();

  for (const order of deliveredOrders) {
    const owner = firstAssignmentByOrder.get(order.id);
    if (!owner) continue;

    const key = owner.operatorId;
    if (!operatorMap.has(key)) {
      operatorMap.set(key, {
        operatorId: owner.operatorId,
        operatorName: owner.operatorName,
        orders: [],
      });
    }

    operatorMap.get(key)!.orders.push({
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      total: Number(order.total),
      customerName: order.customer.name,
      customerPhone: order.customer.phone,
      items: order.items.map((it: { name: string; qty: number; total: unknown }) => ({
        name: it.name,
        qty: it.qty,
        total: Number(it.total),
      })),
      createdAt: order.updatedAt,
    });
  }

  const result = Array.from(operatorMap.values())
    .map((op) => ({
      operatorId: op.operatorId,
      operatorName: op.operatorName,
      totalOrders: op.orders.length,
      totalAmount: op.orders.reduce((sum, order) => sum + order.total, 0),
      orders: op.orders,
    }))
    .sort((a, b) => a.operatorName.localeCompare(b.operatorName));

  return NextResponse.json({
    data: result,
    fromDate: dayStart.toISOString(),
    toDate: dayEnd.toISOString(),
  });
}
