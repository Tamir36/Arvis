import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

const DELIVERY_FEE_PER_ORDER = 6000;

function parseDateKey(value: string | null): Date {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function computeOrderAmounts(total: number, status: string, paymentStatus: string) {
  const isDelivered = status === "DELIVERED";
  const driverFee = isDelivered ? DELIVERY_FEE_PER_ORDER : 0;

  if (!isDelivered) {
    return { driverFee, companyAmount: 0 };
  }

  const companyAmount = paymentStatus === "PAID"
    ? 0
    : total - driverFee;

  return { driverFee, companyAmount };
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session || !["ADMIN", "DRIVER"].includes(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isDriver = session.user.role === "DRIVER";

  const { searchParams } = new URL(request.url);
  const targetDate = parseDateKey(searchParams.get("date"));
  const y = targetDate.getFullYear();
  const m = targetDate.getMonth();
  const d = targetDate.getDate();

  const dayStart = new Date(y, m, d, 0, 0, 0, 0);
  const dayEnd = new Date(y, m, d, 23, 59, 59, 999);

  // Fetch all assigned orders for the day, including direct-created orders without delivery rows.
  const orders = await prisma.order.findMany({
    where: {
      assignedToId: { not: null },
      ...(isDriver ? { assignedToId: session.user.id } : {}),
      status: "DELIVERED",
      updatedAt: { gte: dayStart, lte: dayEnd },
    },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      paymentStatus: true,
      total: true,
      createdAt: true,
      assignedToId: true,
      assignedTo: {
        select: { id: true, name: true },
      },
      customer: {
        select: { name: true, phone: true },
      },
      items: {
        select: {
          id: true,
          name: true,
          qty: true,
          total: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  // Group by driver
  const driverMap = new Map<
    string,
    {
      driverId: string;
      driverName: string;
      totalOrders: number;
      delivered: number;
      cancelled: number;
      returned: number;
      deliveredAmount: number;
      totalAmount: number;
      driverFee: number;
      companyPayout: number;
      orders: {
        orderId: string;
        orderNumber: string;
        status: string;
        paymentStatus: string;
        total: number;
        driverFee: number;
        companyAmount: number;
        customerName: string;
        customerPhone: string;
        createdAt: Date;
        items: {
          id: string;
          name: string;
          qty: number;
          total: number;
        }[];
      }[];
    }
  >();

  for (const order of orders) {
    if (!order.assignedToId || !order.assignedTo) continue;

    const key = order.assignedToId;
    if (!driverMap.has(key)) {
      driverMap.set(key, {
        driverId: order.assignedToId,
        driverName: order.assignedTo.name,
        totalOrders: 0,
        delivered: 0,
        cancelled: 0,
        returned: 0,
        deliveredAmount: 0,
        totalAmount: 0,
        driverFee: 0,
        companyPayout: 0,
        orders: [],
      });
    }

    const entry = driverMap.get(key)!;
    const orderTotal = Number(order.total);
    const { driverFee, companyAmount } = computeOrderAmounts(
      orderTotal,
      String(order.status),
      String(order.paymentStatus),
    );

    entry.totalOrders += 1;
    entry.totalAmount += orderTotal;
    entry.driverFee += driverFee;
    entry.companyPayout += companyAmount;

    if (order.status === "DELIVERED") {
      entry.delivered += 1;
      entry.deliveredAmount += orderTotal;
    } else if (order.status === "CANCELLED") {
      entry.cancelled += 1;
    } else if (order.status === "RETURNED") {
      entry.returned += 1;
    }

    entry.orders.push({
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: String(order.status),
      paymentStatus: String(order.paymentStatus),
      total: orderTotal,
      driverFee,
      companyAmount,
      customerName: order.customer.name,
      customerPhone: order.customer.phone,
      createdAt: order.createdAt,
      items: order.items.map((it) => ({
        id: it.id,
        name: it.name,
        qty: it.qty,
        total: Number(it.total),
      })),
    });
  }

  const result = Array.from(driverMap.values()).map((d) => ({
    driverId: d.driverId,
    driverName: d.driverName,
    totalOrders: d.totalOrders,
    delivered: d.delivered,
    cancelled: d.cancelled,
    returned: d.returned,
    deliveredAmount: d.deliveredAmount,
    totalAmount: d.totalAmount,
    driverFee: d.driverFee,
    companyPayout: d.companyPayout,
    orders: d.orders,
  }));

  return NextResponse.json({ data: result, date: dayStart.toISOString() });
}
