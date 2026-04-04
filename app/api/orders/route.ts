import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { generateOrderNumber } from "@/lib/utils";
import { Prisma } from "@prisma/client";

const SOURCE_LABELS: Record<string, string> = {
  PHONE: "Утсаар",
  PAGE_LEAD: "Page дугаар",
};

const CONTACT_LABELS: Record<string, string> = {
  CONTACTED: "Холбогдсон",
  UNREACHABLE: "Холбогдох боломжгүй",
  BUSY: "Завгүй",
};

const ROLLOVER_STATUSES = ["PENDING", "CONFIRMED", "PACKED", "SHIPPED", "RETURNED"] as const;
const ROLLOVER_MIN_INTERVAL_MS = 60_000;

let lastRolloverRunAt = 0;
let rolloverInFlight: Promise<void> | null = null;

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function nextDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, 0, 0, 0, 0);
}

async function rolloverOpenDeliveriesToToday(userId: string) {
  const today = startOfDay(new Date());
  const tomorrow = nextDay(today);

  const overdueAssignments = await prisma.deliveryAssignment.findMany({
    where: {
      order: {
        status: { in: [...ROLLOVER_STATUSES] },
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
          id: true,
          date: true,
          startTime: true,
          endTime: true,
          maxOrders: true,
          zone: true,
          isActive: true,
        },
      },
    },
    take: 60,
  });

  const ordersWithoutDelivery = await prisma.order.findMany({
    where: {
      status: { in: [...ROLLOVER_STATUSES] },
      assignedToId: { not: null },
      delivery: { is: null },
    },
    select: {
      id: true,
      status: true,
      assignedToId: true,
    },
    take: 60,
  });

  const unassignedOrdersToRollover = await prisma.order.findMany({
    where: {
      status: { in: [...ROLLOVER_STATUSES] },
      assignedToId: null,
      delivery: { is: null },
      NOT: {
        auditLogs: {
          some: {
            action: "DELIVERY_DATE_ROLLED_OVER",
            createdAt: {
              gte: today,
              lt: tomorrow,
            },
          },
        },
      },
    },
    select: {
      id: true,
      status: true,
      createdAt: true,
    },
    take: 60,
  });

  if (
    overdueAssignments.length === 0
    && ordersWithoutDelivery.length === 0
    && unassignedOrdersToRollover.length === 0
  ) {
    return;
  }

  const driverIds = Array.from(
    new Set(
      ordersWithoutDelivery
        .map((order) => order.assignedToId)
        .filter((id): id is string => Boolean(id)),
    ),
  );

  const agents = driverIds.length > 0
    ? await prisma.deliveryAgent.findMany({
        where: { userId: { in: driverIds } },
        select: { id: true, userId: true },
      })
    : [];

  const agentByUserId = new Map(agents.map((agent) => [agent.userId, agent.id]));

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

      // await tx.orderAuditLog.create({
      //   data: {
      //     orderId: assignment.orderId,
      //     userId,
      //     action: "DELIVERY_DATE_ROLLED_OVER",
      //     oldValue: assignment.timeSlot.date.toISOString(),
      //     newValue: JSON.stringify({
      //       fromDate: assignment.timeSlot.date.toISOString(),
      //       toDate: today.toISOString(),
      //       status: assignment.order.status,
      //     }),
      //   },
      // });
    }

    for (const order of ordersWithoutDelivery) {
      if (!order.assignedToId) continue;

      const agentId = agentByUserId.get(order.assignedToId);
      if (!agentId) continue;

      const slot = await tx.timeSlot.create({
        data: {
          date: today,
          startTime: "09:00",
          endTime: "21:00",
          maxOrders: 100,
          bookedCount: 0,
          isActive: true,
        },
        select: { id: true },
      });

      await tx.deliveryAssignment.create({
        data: {
          orderId: order.id,
          agentId,
          timeSlotId: slot.id,
          status: order.status,
          notes: "Auto-created by rollover to keep delivery date in sync",
        },
      });

      // await tx.orderAuditLog.create({
      //   data: {
      //     orderId: order.id,
      //     userId,
      //     action: "DELIVERY_DATE_ROLLED_OVER",
      //     oldValue: null,
      //     newValue: JSON.stringify({
      //       toDate: today.toISOString(),
      //       status: order.status,
      //       reason: "missing_delivery_assignment_auto_created",
      //     }),
      //   },
      // });
    }

    for (const order of unassignedOrdersToRollover) {
      // await tx.orderAuditLog.create({
      //   data: {
      //     orderId: order.id,
      //     userId,
      //     action: "DELIVERY_DATE_ROLLED_OVER",
      //     oldValue: order.createdAt.toISOString(),
      //     newValue: JSON.stringify({
      //       toDate: today.toISOString(),
      //       status: order.status,
      //       reason: "unassigned_no_delivery_daily_rollover",
      //     }),
      //   },
      // });
    }
  }, {
    maxWait: 45000,
    timeout: 45000,
  });
}

async function maybeRunRollover(userId: string) {
  const now = Date.now();
  if (now - lastRolloverRunAt < ROLLOVER_MIN_INTERVAL_MS) {
    return;
  }

  if (rolloverInFlight) {
    await rolloverInFlight;
    return;
  }

  rolloverInFlight = (async () => {
    try {
      await rolloverOpenDeliveriesToToday(userId);
      lastRolloverRunAt = Date.now();
    } finally {
      rolloverInFlight = null;
    }
  })();

  await rolloverInFlight;
}

async function ensureDriverHasStock(
  driverId: string,
  items: Array<{ productId: string; qty: number; name: string }>,
) {
  if (!driverId || items.length === 0) return;

  const requiredByProduct = new Map<string, { qty: number; name: string }>();
  for (const item of items) {
    const previous = requiredByProduct.get(item.productId);
    requiredByProduct.set(item.productId, {
      qty: (previous?.qty ?? 0) + item.qty,
      name: item.name,
    });
  }

  const requiredEntries = Array.from(requiredByProduct.entries()).map(([productId, value]) => ({
    productId,
    qty: value.qty,
    name: value.name,
  }));

  const stocks = await prisma.driverStock.findMany({
    where: {
      driverId,
      productId: { in: requiredEntries.map((entry) => entry.productId) },
    },
    select: {
      productId: true,
      quantity: true,
    },
  });

  const stockByProduct = new Map(stocks.map((stock) => [stock.productId, stock.quantity]));
  const insufficient = requiredEntries.filter((entry) => (stockByProduct.get(entry.productId) ?? 0) < entry.qty);

  if (insufficient.length > 0) {
    const labels = insufficient.map((entry) => entry.name).join(", ");
    throw new Error(`DRIVER_STOCK_INSUFFICIENT:${labels}`);
  }
}

function buildStockAuditPayload(
  items: Array<{ productId: string; qty: number; name: string }>,
  options?: {
    driverId?: string | null;
    driverName?: string | null;
    reason?: string;
  },
) {
  return JSON.stringify({
    driverId: options?.driverId ?? null,
    driverName: options?.driverName ?? null,
    reason: options?.reason ?? null,
    items: items.map((item) => ({
      productId: item.productId,
      name: item.name,
      qty: item.qty,
    })),
  });
}

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Нэвтрэх шаардлагатай" }, { status: 401 });
    }

    void maybeRunRollover(session.user.id).catch((error) => {
      console.error("Rollover background task failed:", error);
    });

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
    const limit = Math.min(100, parseInt(searchParams.get("limit") ?? "10"));
    const includeCount = searchParams.get("includeCount") !== "0";
    const search = searchParams.get("search") ?? "";
    const phone = searchParams.get("phone") ?? "";
    const address = searchParams.get("address") ?? "";
    const product = searchParams.get("product") ?? "";
    const fromDate = searchParams.get("fromDate");
    const toDate = searchParams.get("toDate");

    const where: Prisma.OrderWhereInput = {};
    const andFilters: Prisma.OrderWhereInput[] = [];

    if (fromDate || toDate) {
      let fromDateValue: Date | null = null;
      let toDateValue: Date | null = null;

      if (fromDate && /^\d{4}-\d{2}-\d{2}$/.test(fromDate)) {
        const [y, m, d] = fromDate.split("-").map(Number);
        fromDateValue = new Date(y, m - 1, d, 0, 0, 0, 0);
      }

      if (toDate && /^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
        const [y, m, d] = toDate.split("-").map(Number);
        toDateValue = new Date(y, m - 1, d, 23, 59, 59, 999);
      }

      if (fromDateValue && toDateValue && fromDateValue > toDateValue) {
        const swappedFrom = new Date(toDateValue.getFullYear(), toDateValue.getMonth(), toDateValue.getDate(), 0, 0, 0, 0);
        const swappedTo = new Date(fromDateValue.getFullYear(), fromDateValue.getMonth(), fromDateValue.getDate(), 23, 59, 59, 999);
        fromDateValue = swappedFrom;
        toDateValue = swappedTo;
      }

      const dateRange: Prisma.DateTimeFilter = {};
      if (fromDateValue) dateRange.gte = fromDateValue;
      if (toDateValue) dateRange.lte = toDateValue;

      const todayStart = startOfDay(new Date());
      const todayEnd = nextDay(todayStart);
      const includesToday =
        (!dateRange.gte || dateRange.gte < todayEnd)
        && (!dateRange.lte || dateRange.lte >= todayStart);

      if (dateRange.gte || dateRange.lte) {
        const dateOrFilters: Prisma.OrderWhereInput[] = [
          {
            status: { in: ["DELIVERED", "CANCELLED"] },
            updatedAt: dateRange,
          },
          {
            status: { notIn: ["DELIVERED", "CANCELLED"] },
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
              {
                status: { notIn: ["DELIVERED", "CANCELLED"] },
              },
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
                status: { in: [...ROLLOVER_STATUSES] },
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

        andFilters.push({
          OR: dateOrFilters,
        });

        if (!includesToday) {
          andFilters.push({
            status: { notIn: [...ROLLOVER_STATUSES] },
          });
        }
      }
    }

    if (search) {
      andFilters.push({
        OR: [
        { orderNumber: { contains: search } },
        { customer: { name: { contains: search } } },
        { customer: { phone: { contains: search } } },
        { customer: { address: { contains: search } } },
        { shippingAddress: { contains: search } },
        { assignedTo: { name: { contains: search } } },
        { items: { some: { name: { contains: search } } } },
        { items: { some: { product: { name: { contains: search } } } } },
        ],
      });
    }

    if (phone) {
      andFilters.push({
        customer: { phone: { contains: phone } },
      });
    }

    if (address) {
      andFilters.push({
        OR: [
          { shippingAddress: { contains: address } },
          { customer: { address: { contains: address } } },
        ],
      });
    }

    if (product) {
      andFilters.push({
        OR: [
          { items: { some: { name: { contains: product } } } },
          { items: { some: { product: { name: { contains: product } } } } },
        ],
      });
    }

    if (andFilters.length > 0) {
      where.AND = andFilters;
    }

    const data = await prisma.order.findMany({
        where,
        include: {
          customer: {
            select: {
              id: true,
              name: true,
              phone: true,
              address: true,
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
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          assignedTo: {
            select: {
              id: true,
              name: true,
            },
          },
          auditLogs: {
            where: { action: "CREATED" },
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  role: true,
                },
              },
            },
            orderBy: { createdAt: "asc" },
            take: 1,
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      });

    const total = includeCount
      ? await prisma.order.count({ where })
      : data.length;

    return NextResponse.json({
      data,
      meta: {
        page,
        pageSize: limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Алдаа гарлаа" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Нэвтрэх шаардлагатай" }, { status: 401 });
    }

    const body = await req.json();

    const normalizedItems = Array.isArray(body.items)
      ? body.items
          .map((item: any) => ({
            productId: String(item.productId ?? ""),
            qty: Number(item.qty ?? 0),
            unitPrice: Number(item.unitPrice ?? 0),
          }))
          .filter((item: { productId: string; qty: number; unitPrice: number }) => item.productId && Number.isFinite(item.qty) && item.qty > 0 && Number.isFinite(item.unitPrice) && item.unitPrice >= 0)
      : [];

    if (normalizedItems.length === 0) {
      return NextResponse.json({ error: "Дор хаяж нэг бараа нэмнэ үү" }, { status: 400 });
    }

    const customerPhone = String(body.customer?.phone ?? "").trim();
    if (!customerPhone) {
      return NextResponse.json({ error: "Утасны дугаар заавал оруулна" }, { status: 400 });
    }

    const customerName = String(body.customer?.name ?? "").trim() || "Үл мэдэгдэх";
    const customerAddress = String(body.customer?.address ?? "").trim();
    const customerDistrict = String(body.customer?.district ?? "").trim();

    const deliveryZone = String(body.deliveryZone ?? "").trim();
    const trField = String(body.trField ?? "").trim();

    const productIds = normalizedItems.map((item: { productId: string }) => item.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, basePrice: true },
    });

    const productMap = new Map(products.map((product) => [product.id, product]));

    const unavailable = normalizedItems.filter((item: { productId: string }) => !productMap.has(item.productId));
    if (unavailable.length > 0) {
      return NextResponse.json({ error: "Зарим бараа олдсонгүй" }, { status: 400 });
    }

    const computedItems: Array<{
      productId: string;
      name: string;
      qty: number;
      unitPrice: number;
      total: number;
    }> = normalizedItems.map((item: { productId: string; qty: number; unitPrice: number }) => {
      const product = productMap.get(item.productId)!;
      const unitPrice = item.unitPrice;
      const total = unitPrice * item.qty;

      return {
        productId: item.productId,
        name: product.name,
        qty: item.qty,
        unitPrice,
        total,
      };
    });

    const subtotalNumber = computedItems.reduce((sum: number, item) => sum + item.total, 0);
    const deliveryFeeNumber = Number(body.deliveryFee ?? 0);
    const discountNumber = Number(body.discount ?? 0);
    const taxNumber = Number(body.tax ?? 0);
    const totalNumber = subtotalNumber - discountNumber + deliveryFeeNumber + taxNumber;

    const existingCustomer = await prisma.customer.findFirst({
      where: { phone: customerPhone },
      orderBy: { createdAt: "desc" },
    });

    const customer = existingCustomer
      ? await prisma.customer.update({
          where: { id: existingCustomer.id },
          data: {
            name: customerName,
            address: customerAddress || undefined,
            district: customerDistrict || undefined,
          },
        })
      : await prisma.customer.create({
          data: {
            name: customerName,
            phone: customerPhone,
            address: customerAddress || undefined,
            district: customerDistrict || undefined,
          },
        });

    const extraNote = String(body.notes ?? "").trim();
    const noteParts: string[] = [];
    if (deliveryZone) noteParts.push(`Бүс: ${deliveryZone}`);
    if (trField) noteParts.push(`Тр: ${trField}`);
    if (extraNote) noteParts.push(extraNote);
    const composedNote = noteParts.length > 0 ? noteParts.join(" | ") : null;

    const assignedDriverId = body.assignedDriverId ? String(body.assignedDriverId) : "";
    const assignedDriver = assignedDriverId
      ? await prisma.user.findFirst({
          where: {
            id: assignedDriverId,
            role: "DRIVER",
            isActive: true,
          },
          select: { id: true, name: true },
        })
      : null;

    if (assignedDriverId && !assignedDriver) {
      return NextResponse.json({ error: "Жолооч олдсонгүй" }, { status: 400 });
    }

    const requestedStatus = typeof body.status === "string" && body.status.trim() ? String(body.status).trim() : "";
    const initialStatus = assignedDriverId && (!requestedStatus || requestedStatus === "PENDING")
      ? "CONFIRMED"
      : (requestedStatus || "PENDING");

    if (assignedDriverId && ["PENDING", "CONFIRMED", "SHIPPED", "DELIVERED"].includes(initialStatus)) {
      await ensureDriverHasStock(
        assignedDriverId,
        computedItems.map((item) => ({
          productId: item.productId,
          qty: item.qty,
          name: item.name,
        })),
      );
    }

    const isInitiallyDelivered = initialStatus === "DELIVERED";
    const order = await prisma.$transaction(async (tx) => {
      const createdOrder = await tx.order.create({
        data: {
          orderNumber: generateOrderNumber(),
          customerId: customer.id,
          status: initialStatus as any,
          paymentStatus: body.paymentStatus ?? "UNPAID",
          subtotal: new Prisma.Decimal(subtotalNumber),
          discount: new Prisma.Decimal(discountNumber),
          deliveryFee: new Prisma.Decimal(deliveryFeeNumber),
          tax: new Prisma.Decimal(taxNumber),
          total: new Prisma.Decimal(totalNumber),
          shippingAddress: customerAddress || undefined,
          notes: composedNote,
          assignedToId: assignedDriverId || undefined,
          items: {
            create: computedItems.map((item) => ({
              productId: item.productId,
              name: item.name,
              qty: item.qty,
              unitPrice: new Prisma.Decimal(item.unitPrice),
              discount: new Prisma.Decimal(0),
              tax: new Prisma.Decimal(0),
              total: new Prisma.Decimal(item.total),
            })),
          },
          auditLogs: {
            create: [
              {
                userId: session.user.id,
                action: "CREATED",
                newValue: JSON.stringify(computedItems.map((item) => ({
                  name: item.name,
                  qty: item.qty,
                }))),
              },
              ...(assignedDriver
                ? [{
                    userId: session.user.id,
                    action: "DRIVER_CHANGED",
                    oldValue: null,
                    newValue: assignedDriver.name,
                  }]
                : []),
              ...(isInitiallyDelivered
                ? [{
                    userId: session.user.id,
                    action: "DRIVER_STOCK_DEDUCTED",
                    oldValue: null,
                    newValue: buildStockAuditPayload(
                      computedItems.map((item) => ({
                        productId: item.productId,
                        qty: item.qty,
                        name: item.name,
                      })),
                      {
                        driverId: assignedDriverId || null,
                        driverName: assignedDriver?.name ?? null,
                        reason: "delivered",
                      },
                    ),
                  }]
                : []),
            ],
          },
        },
        select: {
          id: true,
          orderNumber: true,
          createdAt: true,
          total: true,
          status: true,
          paymentStatus: true,
          notes: true,
          shippingAddress: true,
          customer: {
            select: {
              name: true,
              phone: true,
              address: true,
            },
          },
          assignedTo: {
            select: {
              id: true,
              name: true,
            },
          },
          delivery: {
            select: {
              timeSlot: {
                select: {
                  date: true,
                },
              },
            },
          },
          items: {
            select: {
              id: true,
              qty: true,
              product: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          auditLogs: {
            where: { action: "CREATED" },
            orderBy: { createdAt: "asc" },
            take: 1,
            select: {
              id: true,
              action: true,
              oldValue: true,
              newValue: true,
              createdAt: true,
              user: {
                select: {
                  id: true,
                  name: true,
                  role: true,
                },
              },
            },
          },
        },
      });

      if (isInitiallyDelivered) {
        const requiredByProduct = new Map<string, { qty: number; name: string }>();
        for (const item of computedItems) {
          const previous = requiredByProduct.get(item.productId);
          requiredByProduct.set(item.productId, {
            qty: (previous?.qty ?? 0) + item.qty,
            name: item.name,
          });
        }

        if (assignedDriverId) {
          for (const [productId, required] of Array.from(requiredByProduct.entries())) {
            const updateResult = await tx.driverStock.updateMany({
              where: {
                driverId: assignedDriverId,
                productId,
                quantity: { gte: required.qty },
              },
              data: { quantity: { decrement: required.qty } },
            });

            if (updateResult.count === 0) {
              throw new Error(`INSUFFICIENT_DRIVER_STOCK:${required.name}`);
            }
          }
        } else {
          for (const [productId, required] of Array.from(requiredByProduct.entries())) {
            const updateResult = await tx.inventory.updateMany({
              where: {
                productId,
                quantity: { gte: required.qty },
              },
              data: { quantity: { decrement: required.qty } },
            });

            if (updateResult.count === 0) {
              throw new Error(`INSUFFICIENT_WAREHOUSE_STOCK:${required.name}`);
            }
          }
        }
      }

      return createdOrder;
    }, {
      maxWait: 45000,
      timeout: 45000,
    });

    return NextResponse.json(order, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("DRIVER_STOCK_INSUFFICIENT:")) {
      const itemNames = err.message.split(":").slice(1).join(":") || "Сонгосон бараа";
      return NextResponse.json({ error: `${itemNames} бараа дууссан байна` }, { status: 400 });
    }

    if (err instanceof Error && err.message.startsWith("INSUFFICIENT_DRIVER_STOCK:")) {
      const itemName = err.message.split(":").slice(1).join(":") || "Сонгосон бараа";
      return NextResponse.json(
        { error: `${itemName}: жолоочийн нөөцөд хангалтгүй байна` },
        { status: 400 },
      );
    }

    if (err instanceof Error && err.message.startsWith("INSUFFICIENT_WAREHOUSE_STOCK:")) {
      const itemName = err.message.split(":").slice(1).join(":") || "Сонгосон бараа";
      return NextResponse.json(
        { error: `${itemName}: агуулахын үлдэгдэл хүрэлцэхгүй байна` },
        { status: 400 },
      );
    }

    console.error(err);
    return NextResponse.json({ error: "Алдаа гарлаа" }, { status: 500 });
  }
}
