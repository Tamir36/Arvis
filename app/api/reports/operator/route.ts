import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const dateParam = searchParams.get("date");

  const now = new Date();
  const targetDate = dateParam ? new Date(dateParam) : now;
  const y = targetDate.getFullYear();
  const m = targetDate.getMonth();
  const d = targetDate.getDate();

  const dayStart = new Date(y, m, d, 0, 0, 0, 0);
  const dayEnd = new Date(y, m, d, 23, 59, 59, 999);

  // Find CREATED audit logs within the day to identify who registered each order
  const auditLogs = await prisma.orderAuditLog.findMany({
    where: {
      action: "CREATED",
      createdAt: { gte: dayStart, lte: dayEnd },
      user: { role: "OPERATOR" },
    },
    select: {
      orderId: true,
      user: { select: { id: true, name: true } },
      createdAt: true,
      order: {
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
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const orderIds = Array.from(new Set(auditLogs.map((log) => log.orderId)));

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

  for (const log of auditLogs) {
    if (!log.order) continue;
    const owner = firstAssignmentByOrder.get(log.orderId);
    if (!owner) continue;
    if (String(log.order.status) !== "DELIVERED") continue;
    const operatorId = owner?.operatorId ?? log.user.id;
    const operatorName = owner?.operatorName ?? log.user.name;

    const key = operatorId;
    if (!operatorMap.has(key)) {
      operatorMap.set(key, {
        operatorId,
        operatorName,
        orders: [],
      });
    }
    operatorMap.get(key)!.orders.push({
      orderId: log.order.id,
      orderNumber: log.order.orderNumber,
      status: log.order.status,
      total: Number(log.order.total),
      customerName: log.order.customer.name,
      customerPhone: log.order.customer.phone,
      items: log.order.items.map((it: { name: string; qty: number; total: unknown }) => ({
        name: it.name,
        qty: it.qty,
        total: Number(it.total),
      })),
      createdAt: owner?.assignedAt ?? log.createdAt,
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
