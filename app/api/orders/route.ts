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

const ALL_ORDER_STATUSES = ["BLANK", "PENDING", "CONFIRMED", "PACKED", "SHIPPED", "DELIVERED", "CANCELLED", "RETURNED"] as const;

const ROLLOVER_STATUSES = ["BLANK", "PENDING", "CONFIRMED", "PACKED", "SHIPPED", "RETURNED"] as const;
const HISTORICAL_EXCLUDED_CARRYOVER_STATUSES = ["BLANK", "PENDING", "CONFIRMED", "PACKED", "SHIPPED"] as const;
const DRIVER_RESERVED_FOR_ASSIGNMENT_STATUSES = ["CONFIRMED", "SHIPPED", "RETURNED"] as const;
const ROLLOVER_MIN_INTERVAL_MS = 60_000;
const BUSINESS_TIME_ZONE = "Asia/Ulaanbaatar";
const BUSINESS_UTC_OFFSET_MINUTES = 8 * 60;

let lastRolloverRunAt = 0;
let rolloverInFlight: Promise<void> | null = null;

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

  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0) - BUSINESS_UTC_OFFSET_MINUTES * 60 * 1000);
}

function nextDay(date: Date): Date {
  return new Date(date.getTime() + 24 * 60 * 60 * 1000);
}

function parseDateStart(value: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const [y, m, d] = value.split("-").map(Number);

  // Convert selected UB calendar day to an exact UTC boundary for 00:00 UB.
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0) - BUSINESS_UTC_OFFSET_MINUTES * 60 * 1000);
}

function toDayEnd(dayStart: Date): Date {
  return new Date(nextDay(dayStart).getTime() - 1);
}

function normalizeMnPhone(value: string): string | null {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return null;

  const normalized = digits.startsWith("976") && digits.length === 11
    ? digits.slice(3)
    : digits;

  return /^\d{8}$/.test(normalized) ? normalized : null;
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
  const reservedItems = await prisma.orderItem.findMany({
    where: {
      productId: { in: requiredEntries.map((entry) => entry.productId) },
      order: {
        assignedToId: driverId,
        status: { in: [...DRIVER_RESERVED_FOR_ASSIGNMENT_STATUSES] },
      },
    },
    select: {
      productId: true,
      qty: true,
    },
  });

  const reservedByProduct = new Map<string, number>();
  for (const item of reservedItems) {
    reservedByProduct.set(item.productId, (reservedByProduct.get(item.productId) ?? 0) + Number(item.qty ?? 0));
  }

  const outOfStockProducts: string[] = [];
  const exceededProducts: string[] = [];

  for (const entry of requiredEntries) {
    const totalQty = stockByProduct.get(entry.productId) ?? 0;
    const reservedQty = reservedByProduct.get(entry.productId) ?? 0;
    const availableQty = totalQty - reservedQty;

    if (totalQty <= 0) {
      outOfStockProducts.push(entry.name);
      continue;
    }

    if (availableQty < entry.qty) {
      exceededProducts.push(entry.name);
    }
  }

  if (outOfStockProducts.length > 0) {
    throw new Error(`DRIVER_STOCK_OUT:${outOfStockProducts.join(", ")}`);
  }

  if (exceededProducts.length > 0) {
    throw new Error(`DRIVER_STOCK_EXCEEDED:${exceededProducts.join(", ")}`);
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
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const requestedLimit = parseInt(searchParams.get("limit") ?? "10", 10);
    const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.min(600, requestedLimit)
      : 10;
    const includeCount = searchParams.get("includeCount") !== "0";
    const search = searchParams.get("search") ?? "";
    const phone = searchParams.get("phone") ?? "";
    const address = searchParams.get("address") ?? "";
    const product = searchParams.get("product") ?? "";
    const productIdsParam = searchParams.get("productIds") ?? "";
    const statusesParam = searchParams.get("statuses") ?? "";
    const driverIdsParam = searchParams.get("driverIds") ?? "";
    const fromDate = searchParams.get("fromDate");
    const toDate = searchParams.get("toDate");

    const requestedStatuses = statusesParam
      .split(",")
      .map((status) => status.trim().toUpperCase())
      .filter((status): status is (typeof ALL_ORDER_STATUSES)[number] =>
        (ALL_ORDER_STATUSES as readonly string[]).includes(status),
      );
    const requestedDriverIds = Array.from(
      new Set(
        driverIdsParam
          .split(",")
          .map((driverId) => driverId.trim())
          .filter(Boolean),
      ),
    );
    const requestedProductIds = Array.from(
      new Set(
        productIdsParam
          .split(",")
          .map((productId) => productId.trim())
          .filter(Boolean),
      ),
    );
    const hasStatusFilter = requestedStatuses.length > 0;
    const requestedStatusSet = new Set(requestedStatuses);

    const where: Prisma.OrderWhereInput = {};
    const andFilters: Prisma.OrderWhereInput[] = [];

    if (fromDate || toDate) {
      let fromDateValue: Date | null = null;
      let toDateValue: Date | null = null;

      fromDateValue = parseDateStart(fromDate);

      const toDateStart = parseDateStart(toDate);
      if (toDateStart) {
        toDateValue = toDayEnd(toDateStart);
      }

      if (fromDateValue && toDateValue && fromDateValue > toDateValue) {
        const swappedFrom = startOfDay(toDateValue);
        const swappedTo = toDayEnd(startOfDay(fromDateValue));
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
        const deliveredLatestLogs = await prisma.orderAuditLog.groupBy({
          by: ["orderId"],
          where: {
            action: "STATUS_CHANGED",
            newValue: "DELIVERED",
          },
          _max: {
            createdAt: true,
          },
        });

        const deliveredOrderIds = deliveredLatestLogs
          .filter((row) => {
            const ts = row._max.createdAt;
            if (!ts) return false;
            if (dateRange.gte && ts < dateRange.gte) return false;
            if (dateRange.lte && ts > dateRange.lte) return false;
            return true;
          })
          .map((row) => row.orderId);

        const cancelledLatestLogs = await prisma.orderAuditLog.groupBy({
          by: ["orderId"],
          where: {
            action: "STATUS_CHANGED",
            newValue: "CANCELLED",
          },
          _max: {
            createdAt: true,
          },
        });

        const cancelledOrderIds = cancelledLatestLogs
          .filter((row) => {
            const ts = row._max.createdAt;
            if (!ts) return false;
            if (dateRange.gte && ts < dateRange.gte) return false;
            if (dateRange.lte && ts > dateRange.lte) return false;
            return true;
          })
          .map((row) => row.orderId);

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
                {
                  status: "DELIVERED",
                },
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
                {
                  status: "CANCELLED",
                },
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
                {
                  status: "RETURNED",
                },
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

        const includeDelivered = !hasStatusFilter || requestedStatusSet.has("DELIVERED");
        const includeCancelled = !hasStatusFilter || requestedStatusSet.has("CANCELLED");
        const includeReturned = !hasStatusFilter || requestedStatusSet.has("RETURNED");
        const nonTerminalStatuses = hasStatusFilter
          ? requestedStatuses.filter((status) => !["DELIVERED", "CANCELLED", "RETURNED"].includes(status))
          : [];

        const dateOrFilters: Prisma.OrderWhereInput[] = [];

        if (includeDelivered) {
          dateOrFilters.push(deliveredInRangeFilter);
        }

        if (includeCancelled) {
          dateOrFilters.push(cancelledInRangeFilter);
        }

        if (includeReturned) {
          dateOrFilters.push(returnedInRangeFilter);
        }

        if (!hasStatusFilter || nonTerminalStatuses.length > 0) {
          const nonTerminalStatusFilter: Prisma.OrderWhereInput = nonTerminalStatuses.length > 0
            ? { status: { in: nonTerminalStatuses as any } }
            : { status: { notIn: ["DELIVERED", "CANCELLED", "RETURNED"] } };

          dateOrFilters.push({
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
          });

          dateOrFilters.push({
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
          });
        }

        if (includesToday) {
          const todayCarryoverStatuses = hasStatusFilter
            ? requestedStatuses.filter((status) => (ROLLOVER_STATUSES as readonly string[]).includes(status))
            : [...ROLLOVER_STATUSES];

          if (todayCarryoverStatuses.length > 0) {
            dateOrFilters.push({
              AND: [
                {
                  status: { in: todayCarryoverStatuses as any },
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
        }

        andFilters.push({ OR: dateOrFilters });

        if (!includesToday) {
          if (hasStatusFilter) {
            const noTodayStatuses = requestedStatuses.filter(
              (status) => !(HISTORICAL_EXCLUDED_CARRYOVER_STATUSES as readonly string[]).includes(status),
            );
            if (noTodayStatuses.length > 0) {
              andFilters.push({ status: { in: noTodayStatuses as any } });
            } else {
              andFilters.push({ id: { in: [] } });
            }
          } else {
            andFilters.push({
              status: { notIn: [...HISTORICAL_EXCLUDED_CARRYOVER_STATUSES] },
            });
          }
        }
      }
    }

    if (hasStatusFilter) {
      andFilters.push({ status: { in: requestedStatuses as any } });
    }

    if (requestedDriverIds.length > 0) {
      andFilters.push({
        OR: [
          { assignedToId: { in: requestedDriverIds } },
          {
            delivery: {
              is: {
                agent: {
                  userId: { in: requestedDriverIds },
                },
              },
            },
          },
        ],
      });
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

    if (requestedProductIds.length > 0) {
      andFilters.push({
        items: {
          some: {
            productId: { in: requestedProductIds },
          },
        },
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
              agent: {
                select: {
                  userId: true,
                },
              },
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

    const customerPhone = normalizeMnPhone(String(body.customer?.phone ?? ""));
    if (!customerPhone) {
      return NextResponse.json({ error: "Утасны дугаар дутуу бичигдсэн байна" }, { status: 400 });
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
    const initialStatus = assignedDriverId && (!requestedStatus || requestedStatus === "PENDING" || requestedStatus === "BLANK")
      ? "CONFIRMED"
      : (requestedStatus || "BLANK");

    const isInitiallyReserved = assignedDriverId
      && DRIVER_RESERVED_FOR_ASSIGNMENT_STATUSES.includes(initialStatus as typeof DRIVER_RESERVED_FOR_ASSIGNMENT_STATUSES[number]);
    const isInitiallyDelivered = initialStatus === "DELIVERED";

    if (isInitiallyReserved || isInitiallyDelivered) {
      await ensureDriverHasStock(
        assignedDriverId,
        computedItems.map((item) => ({
          productId: item.productId,
          qty: item.qty,
          name: item.name,
        })),
      );
    }

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
                        reason: isInitiallyDelivered ? "delivered" : "reserved_on_create",
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
    if (err instanceof Error && err.message.startsWith("DRIVER_STOCK_OUT:")) {
      const itemNames = err.message.split(":").slice(1).join(":") || "Сонгосон бараа";
      return NextResponse.json({ error: `${itemNames} - бараа дууссан байна` }, { status: 400 });
    }

    if (err instanceof Error && err.message.startsWith("DRIVER_STOCK_EXCEEDED:")) {
      return NextResponse.json({ error: "Жолоочийн үлдэгдэлээс хэтэрсэн байна" }, { status: 400 });
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
