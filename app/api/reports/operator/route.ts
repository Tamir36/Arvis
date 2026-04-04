import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

function parseDateKey(value: string | null): Date {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const targetDate = parseDateKey(searchParams.get("date"));
  const y = targetDate.getFullYear();
  const m = targetDate.getMonth();
  const d = targetDate.getDate();

  const dayStart = new Date(y, m, d, 0, 0, 0, 0);
  const dayEnd = new Date(y, m, d, 23, 59, 59, 999);

  // Delivered orders should be reported by the day their status changed to DELIVERED.
  const deliveredOrders = await prisma.order.findMany({
    where: {
      status: "DELIVERED",
      updatedAt: { gte: dayStart, lte: dayEnd },
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

  // Group by operator
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
      const operatorId = owner.operatorId;
      const operatorName = owner.operatorName;

    const key = operatorId;
    if (!operatorMap.has(key)) {
      operatorMap.set(key, {
        operatorId,
        operatorName,
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

  const result = Array.from(operatorMap.values()).map((op) => ({
    operatorId: op.operatorId,
    operatorName: op.operatorName,
    totalOrders: op.orders.length,
    totalAmount: op.orders.reduce((sum, o) => sum + o.total, 0),
    orders: op.orders,
  }));

  return NextResponse.json({ data: result, date: dayStart.toISOString() });
}
