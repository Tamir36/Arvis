import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getLatestStatusChangedAtByOrderStatus } from "@/lib/status-changes";

const DELIVERY_FEE_PER_ORDER = 6000;
const DRIVER_REPORT_TERMINAL_STATUSES = ["DELIVERED", "CANCELLED", "RETURNED"] as const;
const BUSINESS_UTC_OFFSET_MINUTES = 8 * 60;

function businessDayStart(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0) - BUSINESS_UTC_OFFSET_MINUTES * 60 * 1000);
}

function nextBusinessDay(date: Date): Date {
  return new Date(date.getTime() + 24 * 60 * 60 * 1000);
}

function parseDateKey(value: string | null): Date {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const now = new Date();
    const shifted = new Date(now.getTime() + BUSINESS_UTC_OFFSET_MINUTES * 60 * 1000);
    return businessDayStart(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate());
  }

  const [y, m, d] = value.split("-").map(Number);
  return businessDayStart(y, m, d);
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
  if (!session?.user?.id || !["ADMIN", "DRIVER"].includes(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const targetDate = parseDateKey(searchParams.get("date"));
  const dayStart = targetDate;
  const dayEnd = new Date(nextBusinessDay(dayStart).getTime() - 1);
  const role = String(session.user.role ?? "").toUpperCase();

  // Fetch terminal orders first; day filtering is applied by the latest status-change timestamp for each order's current status.
  const orders = await prisma.order.findMany({
    where: {
      status: { in: [...DRIVER_REPORT_TERMINAL_STATUSES] },
      ...(role === "DRIVER"
        ? {
            OR: [
              { assignedToId: session.user.id },
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
          }
        : {
            assignedToId: { not: null },
          }),
    },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      paymentStatus: true,
      total: true,
      createdAt: true,
      updatedAt: true,
      assignedToId: true,
      assignedTo: {
        select: { id: true, name: true },
      },
      delivery: {
        select: {
          agent: {
            select: {
              userId: true,
              user: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
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

  const latestTerminalAtByOrderStatus = await getLatestStatusChangedAtByOrderStatus(prisma, {
    orderIds: orders.map((order) => order.id),
    statuses: [...DRIVER_REPORT_TERMINAL_STATUSES],
  });

  const filteredOrders = orders.filter((order) => {
    const currentStatus = String(order.status).toUpperCase();
    const statusChangedAt = latestTerminalAtByOrderStatus.get(`${order.id}:${currentStatus}`) ?? order.updatedAt;
    return statusChangedAt >= dayStart && statusChangedAt <= dayEnd;
  });

  filteredOrders.sort((a, b) => {
    const aStatus = String(a.status).toUpperCase();
    const bStatus = String(b.status).toUpperCase();
    const aStatusChangedAt = latestTerminalAtByOrderStatus.get(`${a.id}:${aStatus}`) ?? a.updatedAt;
    const bStatusChangedAt = latestTerminalAtByOrderStatus.get(`${b.id}:${bStatus}`) ?? b.updatedAt;
    return aStatusChangedAt.getTime() - bStatusChangedAt.getTime();
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
        deliveredAt: string;
        items: {
          id: string;
          name: string;
          qty: number;
          total: number;
        }[];
      }[];
    }
  >();

  for (const order of filteredOrders) {
    const effectiveDriverId = order.assignedToId ?? order.delivery?.agent?.userId ?? null;
    const effectiveDriverName = order.assignedTo?.name ?? order.delivery?.agent?.user?.name ?? "Жолооч";
    if (!effectiveDriverId) continue;

    const key = effectiveDriverId;
    if (!driverMap.has(key)) {
      driverMap.set(key, {
        driverId: effectiveDriverId,
        driverName: effectiveDriverName,
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
    if (String(order.status) === "DELIVERED") {
      entry.totalAmount += orderTotal;
    }
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
      deliveredAt: (latestTerminalAtByOrderStatus.get(`${order.id}:${String(order.status).toUpperCase()}`) ?? order.updatedAt).toISOString(),
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
