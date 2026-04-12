import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sendDriverAssignmentEmail } from "@/lib/mailer";
import { Prisma } from "@prisma/client";

interface Params {
  id: string;
}

const DRIVER_RESERVED_STATUSES = new Set(["CONFIRMED", "SHIPPED", "RETURNED", "DELIVERED"]);
const DRIVER_STOCK_CONSUMING_STATUSES = new Set(["DELIVERED"]);
const DRIVER_RESERVED_FOR_ASSIGNMENT_STATUSES = ["CONFIRMED", "SHIPPED", "RETURNED"] as const;

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

function buildPositiveStockDelta(
  currentItems: Array<{ productId: string; qty: number; name: string }>,
  nextItems: Array<{ productId: string; qty: number; name: string }>,
) {
  const currentByProduct = new Map<string, { qty: number; name: string }>();
  for (const item of currentItems) {
    const prev = currentByProduct.get(item.productId);
    currentByProduct.set(item.productId, {
      qty: (prev?.qty ?? 0) + item.qty,
      name: item.name,
    });
  }

  const nextByProduct = new Map<string, { qty: number; name: string }>();
  for (const item of nextItems) {
    const prev = nextByProduct.get(item.productId);
    nextByProduct.set(item.productId, {
      qty: (prev?.qty ?? 0) + item.qty,
      name: item.name,
    });
  }

  const allProductIds = new Set<string>([
    ...Array.from(currentByProduct.keys()),
    ...Array.from(nextByProduct.keys()),
  ]);

  const required: Array<{ productId: string; qty: number; name: string }> = [];
  for (const productId of Array.from(allProductIds)) {
    const currentQty = currentByProduct.get(productId)?.qty ?? 0;
    const next = nextByProduct.get(productId);
    const nextQty = next?.qty ?? 0;
    const diff = nextQty - currentQty;
    if (diff > 0) {
      required.push({
        productId,
        qty: diff,
        name: next?.name ?? currentByProduct.get(productId)?.name ?? "Бараа",
      });
    }
  }

  return required;
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

export async function GET(req: NextRequest, { params }: { params: Promise<Params> }) {
  try {
    const { id } = await params;

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            address: true,
          },
        },
        assignedTo: {
          select: {
            id: true,
            name: true,
            email: true,
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
        auditLogs: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
          take: 120,
        },
      },
    });

    if (!order) {
      return NextResponse.json({ error: "Захиалга олдсонгүй" }, { status: 404 });
    }

    return NextResponse.json(order);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Алдаа гарлаа" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<Params> }) {
  try {
    const { id } = await params;

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Нэвтрэх шаардлагатай" }, { status: 401 });
    }

    const body = await req.json();
    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        customer: true,
        items: true,
        auditLogs: {
          where: { action: "DRIVER_STOCK_DEDUCTED" },
          select: { id: true },
          take: 1,
        },
        assignedTo: {
          select: {
            id: true,
            name: true,
            email: true,
            receiveOrderNotifications: true,
          },
        },
      },
    });

    if (!order) {
      return NextResponse.json({ error: "Захиалга олдсонгүй" }, { status: 404 });
    }

    const updateData: Prisma.OrderUpdateInput = {};
    let nextStatus = typeof body.status === "string" && body.status.trim() ? body.status : order.status;
    let targetDriverId: string | null = order.assignedToId;
    let targetDriverName: string | null = order.assignedTo?.name ?? null;
    let targetDriverEmail: string | null = order.assignedTo?.email ?? null;
    let targetDriverReceiveNotifications = order.assignedTo?.receiveOrderNotifications ?? false;
    let nextDriverAgentId: string | null = null;
    let didChangeCustomerPhone = false;
    let nextCustomerPhone = order.customer.phone ?? "";
    let nextCustomerAddress = order.customer.address ?? null;
    let didChangeDriver = false;
    let didChangeItems = false;
    let nextItemsForStockValidation = order.items.map((item) => ({
      productId: item.productId,
      qty: Number(item.qty),
      name: item.name,
    }));
    const auditChanges: Array<{
      userId: string;
      action: string;
      oldValue?: string | null;
      newValue?: string | null;
    }> = [];

    if (body.paymentStatus && body.paymentStatus !== order.paymentStatus) {
      updateData.paymentStatus = body.paymentStatus;
      auditChanges.push({
        userId: session.user.id,
        action: "PAYMENT_STATUS_CHANGED",
        oldValue: order.paymentStatus,
        newValue: body.paymentStatus,
      });
    }

    if (Object.prototype.hasOwnProperty.call(body, "assignedDriverId")) {
      const nextDriverId = body.assignedDriverId ? String(body.assignedDriverId) : null;
      let nextDriverName: string | null = null;
      if (nextDriverId !== order.assignedToId) {
        if (nextDriverId) {
          const driver = await prisma.user.findFirst({
            where: {
              id: nextDriverId,
              role: "DRIVER",
              isActive: true,
            },
            select: { id: true, name: true, email: true, receiveOrderNotifications: true },
          });

          if (!driver) {
            return NextResponse.json({ error: "Жолооч олдсонгүй" }, { status: 400 });
          }

          nextDriverName = driver.name;
          targetDriverName = driver.name;
          targetDriverEmail = driver.email;
          targetDriverReceiveNotifications = Boolean(driver.receiveOrderNotifications);

          const driverAgent = await prisma.deliveryAgent.upsert({
            where: { userId: nextDriverId },
            update: {},
            create: {
              userId: nextDriverId,
            },
            select: { id: true },
          });

          nextDriverAgentId = driverAgent.id;
        }

        if (!nextDriverId) {
          targetDriverName = null;
          targetDriverEmail = null;
          targetDriverReceiveNotifications = false;
        }

        // Check stock for the new driver BEFORE updating status
        if (
          nextDriverId
          && ["PENDING", "CONFIRMED", "SHIPPED", "RETURNED"].includes(String(order.status))
          && !Array.isArray(body.items)
        ) {
          await ensureDriverHasStock(nextDriverId, nextItemsForStockValidation);
        }

        if (nextDriverId && ["PENDING", "CONFIRMED", "SHIPPED"].includes(String(nextStatus))) {
          nextStatus = "CONFIRMED";
        }

        if (!nextDriverId && ["CONFIRMED", "SHIPPED", "RETURNED"].includes(String(nextStatus))) {
          nextStatus = "PENDING";
        }

        targetDriverId = nextDriverId;
        didChangeDriver = true;

        updateData.assignedTo = nextDriverId ? { connect: { id: nextDriverId } } : { disconnect: true };
        auditChanges.push({
          userId: session.user.id,
          action: "DRIVER_CHANGED",
          oldValue: order.assignedTo?.name ?? null,
          newValue: nextDriverName,
        });
      }
    }

    if (Object.prototype.hasOwnProperty.call(body, "shippingAddress")) {
      const nextAddress = String(body.shippingAddress ?? "").trim();
      const currentAddress = order.shippingAddress ?? "";
      if (nextAddress !== currentAddress) {
        updateData.shippingAddress = nextAddress || null;
        nextCustomerAddress = nextAddress || null;
        auditChanges.push({
          userId: session.user.id,
          action: "ADDRESS_CHANGED",
          oldValue: currentAddress || null,
          newValue: nextAddress || null,
        });
      }
    }

    if (Object.prototype.hasOwnProperty.call(body, "customerPhone")) {
      const nextPhone = String(body.customerPhone ?? "").trim();
      const currentPhone = order.customer.phone ?? "";

      if (!nextPhone) {
        return NextResponse.json({ error: "Утасны дугаар оруулна уу" }, { status: 400 });
      }

      if (nextPhone !== currentPhone) {
        didChangeCustomerPhone = true;
        nextCustomerPhone = nextPhone;
        auditChanges.push({
          userId: session.user.id,
          action: "PHONE_CHANGED",
          oldValue: currentPhone || null,
          newValue: nextPhone,
        });
      }
    }

    if (Object.prototype.hasOwnProperty.call(body, "notes")) {
      const nextNotes = String(body.notes ?? "").trim();
      const currentNotes = order.notes ?? "";
      if (nextNotes !== currentNotes) {
        updateData.notes = nextNotes || null;
        auditChanges.push({
          userId: session.user.id,
          action: "NOTES_CHANGED",
          oldValue: currentNotes || null,
          newValue: nextNotes || null,
        });
      }
    }

    if (Object.prototype.hasOwnProperty.call(body, "appendNote")) {
      const appendedNote = String(body.appendNote ?? "").trim();
      if (appendedNote) {
        if (!Object.prototype.hasOwnProperty.call(body, "notes")) {
          const previousNotes = (order.notes ?? "").trim();
          const mergedNotes = previousNotes ? `${previousNotes}\n${appendedNote}` : appendedNote;
          updateData.notes = mergedNotes;
        }

        auditChanges.push({
          userId: session.user.id,
          action: "NOTE_ADDED",
          oldValue: null,
          newValue: appendedNote,
        });
      }
    }

    if (Array.isArray(body.items)) {
      const normalizedItems = body.items
        .map((item: any) => ({
          id: item.id ? String(item.id) : null,
          productId: String(item.productId ?? ""),
          qty: Number(item.qty ?? 0),
          unitPrice: Number(item.unitPrice ?? 0),
        }))
        .filter((item: { productId: string; qty: number; unitPrice: number }) => (
          item.productId && Number.isFinite(item.qty) && item.qty > 0 && Number.isFinite(item.unitPrice) && item.unitPrice >= 0
        ));

      if (normalizedItems.length === 0) {
        return NextResponse.json({ error: "Дор хаяж нэг бараа шаардлагатай" }, { status: 400 });
      }

      const products = await prisma.product.findMany({
        where: { id: { in: normalizedItems.map((item: { productId: string }) => item.productId) } },
        select: { id: true, name: true },
      });

      const productMap = new Map(products.map((product) => [product.id, product]));
      if (normalizedItems.some((item: { productId: string }) => !productMap.has(item.productId))) {
        return NextResponse.json({ error: "Сонгосон бараа олдсонгүй" }, { status: 400 });
      }

      const currentItems = order.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        name: item.name,
        qty: Number(item.qty),
        unitPrice: Number(item.unitPrice),
      }));

      const currentItemMap = new Map(currentItems.map((item) => [item.id, item]));
      const nextItemIds = new Set(normalizedItems.map((item: { id: string | null }) => item.id).filter(Boolean));
      const addedItems = normalizedItems
        .filter((item: { id: string | null }) => !item.id || !currentItemMap.has(item.id))
        .map((item: { productId: string; qty: number; unitPrice: number }) => ({
          name: productMap.get(item.productId)?.name ?? "Бараа",
          qty: item.qty,
          unitPrice: item.unitPrice,
        }));
      const removedItems = currentItems
        .filter((item) => !nextItemIds.has(item.id))
        .map((item) => ({
          name: item.name,
          qty: item.qty,
          unitPrice: item.unitPrice,
        }));
      const updatedItems = normalizedItems
        .filter((item: { id: string | null }) => Boolean(item.id) && currentItemMap.has(item.id!))
        .map((item: { id: string | null; productId: string; qty: number; unitPrice: number }) => {
          const currentItem = currentItemMap.get(item.id!);
          if (!currentItem) return null;

          const nextItem = {
            name: productMap.get(item.productId)?.name ?? "Бараа",
            qty: item.qty,
            unitPrice: item.unitPrice,
            productId: item.productId,
          };

          if (
            currentItem.productId === nextItem.productId
            && currentItem.qty === nextItem.qty
            && currentItem.unitPrice === nextItem.unitPrice
          ) {
            return null;
          }

          return {
            from: {
              name: currentItem.name,
              qty: currentItem.qty,
              unitPrice: currentItem.unitPrice,
            },
            to: {
              name: nextItem.name,
              qty: nextItem.qty,
              unitPrice: nextItem.unitPrice,
            },
          };
        })
        .filter(Boolean);

      const itemsChanged = addedItems.length > 0 || removedItems.length > 0 || updatedItems.length > 0;

      if (itemsChanged) {
        didChangeItems = true;
        const subtotal = normalizedItems.reduce((sum: number, item: { qty: number; unitPrice: number }) => sum + (item.unitPrice * item.qty), 0);
        const discount = Number(order.discount);
        const deliveryFee = Number(order.deliveryFee);
        const tax = Number(order.tax);
        const total = subtotal - discount + deliveryFee + tax;

        nextItemsForStockValidation = normalizedItems.map((item: { productId: string; qty: number }) => ({
          productId: item.productId,
          qty: item.qty,
          name: productMap.get(item.productId)?.name ?? "Бараа",
        }));

        updateData.subtotal = new Prisma.Decimal(subtotal);
        updateData.total = new Prisma.Decimal(total);
        updateData.items = {
          deleteMany: {},
          create: normalizedItems.map((item: { productId: string; qty: number; unitPrice: number }) => ({
            productId: item.productId,
            name: productMap.get(item.productId)?.name ?? "Бараа",
            qty: item.qty,
            unitPrice: new Prisma.Decimal(item.unitPrice),
            discount: new Prisma.Decimal(0),
            tax: new Prisma.Decimal(0),
            total: new Prisma.Decimal(item.unitPrice * item.qty),
          })),
        };

        auditChanges.push({
          userId: session.user.id,
          action: "ITEMS_CHANGED",
          oldValue: null,
          newValue: JSON.stringify({
            added: addedItems,
            removed: removedItems,
            updated: updatedItems,
          }),
        });
      }
    }

    const currentItemsForStock = order.items.map((item) => ({
      productId: item.productId,
      qty: Number(item.qty),
      name: item.name,
    }));

    const oldDriverId = order.assignedToId;
    const oldDriverName = order.assignedTo?.name ?? null;
    const wasDriverReserved = Boolean(oldDriverId) && DRIVER_RESERVED_STATUSES.has(String(order.status));
    const willDriverReserved = Boolean(targetDriverId) && DRIVER_RESERVED_STATUSES.has(String(nextStatus));
    const wasDriverStockConsumed = Boolean(oldDriverId) && DRIVER_STOCK_CONSUMING_STATUSES.has(String(order.status));
    const willDriverStockConsumed = Boolean(targetDriverId) && DRIVER_STOCK_CONSUMING_STATUSES.has(String(nextStatus));

    const isDriverReassignmentWhileReserved =
      wasDriverReserved
      && willDriverReserved
      && oldDriverId !== targetDriverId;

    const isDriverReassignmentWhileStockConsumed =
      wasDriverStockConsumed
      && willDriverStockConsumed
      && oldDriverId !== targetDriverId;

    const reserveDeltaOnSameDriver =
      wasDriverReserved
      && willDriverReserved
      && oldDriverId === targetDriverId
      ? buildPositiveStockDelta(currentItemsForStock, nextItemsForStockValidation)
      : [];

    const restoreDeltaOnSameDriver =
      wasDriverReserved
      && willDriverReserved
      && oldDriverId === targetDriverId
      ? buildPositiveStockDelta(nextItemsForStockValidation, currentItemsForStock)
      : [];

    const consumeDeltaOnSameDriver =
      wasDriverStockConsumed
      && willDriverStockConsumed
      && oldDriverId === targetDriverId
      ? buildPositiveStockDelta(currentItemsForStock, nextItemsForStockValidation)
      : [];

    const restoreConsumedDeltaOnSameDriver =
      wasDriverStockConsumed
      && willDriverStockConsumed
      && oldDriverId === targetDriverId
      ? buildPositiveStockDelta(nextItemsForStockValidation, currentItemsForStock)
      : [];

    if (nextStatus !== order.status) {
      updateData.status = nextStatus;
      auditChanges.push({
        userId: session.user.id,
        action: "STATUS_CHANGED",
        oldValue: order.status,
        newValue: nextStatus,
      });
    }

    if (willDriverReserved && targetDriverId) {
      if (isDriverReassignmentWhileReserved || !wasDriverReserved) {
        await ensureDriverHasStock(targetDriverId, nextItemsForStockValidation);
      } else if (reserveDeltaOnSameDriver.length > 0) {
        await ensureDriverHasStock(targetDriverId, reserveDeltaOnSameDriver);
      }
    }

    if (!wasDriverStockConsumed && willDriverStockConsumed && targetDriverId) {
      auditChanges.push({
        userId: session.user.id,
        action: "DRIVER_STOCK_DEDUCTED",
        oldValue: null,
        newValue: buildStockAuditPayload(nextItemsForStockValidation, {
          driverId: targetDriverId,
          driverName: targetDriverName,
          reason: nextStatus === "DELIVERED" ? "delivered" : "reserved",
        }),
      });
    }

    if (wasDriverStockConsumed && !willDriverStockConsumed && oldDriverId) {
      auditChanges.push({
        userId: session.user.id,
        action: "DRIVER_STOCK_RESTORED",
        oldValue: null,
        newValue: buildStockAuditPayload(currentItemsForStock, {
          driverId: oldDriverId,
          driverName: oldDriverName,
          reason: nextStatus === "CANCELLED" ? "cancelled" : "released",
        }),
      });
    }

    if (isDriverReassignmentWhileStockConsumed && oldDriverId && targetDriverId) {
      auditChanges.push({
        userId: session.user.id,
        action: "DRIVER_STOCK_RESTORED",
        oldValue: null,
        newValue: buildStockAuditPayload(currentItemsForStock, {
          driverId: oldDriverId,
          driverName: oldDriverName,
          reason: "driver_reassigned",
        }),
      });

      auditChanges.push({
        userId: session.user.id,
        action: "DRIVER_STOCK_DEDUCTED",
        oldValue: null,
        newValue: buildStockAuditPayload(nextItemsForStockValidation, {
          driverId: targetDriverId,
          driverName: targetDriverName,
          reason: nextStatus === "DELIVERED" ? "delivered" : "driver_reassigned",
        }),
      });
    }

    if (wasDriverStockConsumed && willDriverStockConsumed && oldDriverId === targetDriverId && targetDriverId) {
      if (consumeDeltaOnSameDriver.length > 0) {
        auditChanges.push({
          userId: session.user.id,
          action: "DRIVER_STOCK_DEDUCTED",
          oldValue: null,
          newValue: buildStockAuditPayload(consumeDeltaOnSameDriver, {
            driverId: targetDriverId,
            driverName: targetDriverName,
            reason: "delivered_items_changed",
          }),
        });
      }

      if (restoreConsumedDeltaOnSameDriver.length > 0) {
        auditChanges.push({
          userId: session.user.id,
          action: "DRIVER_STOCK_RESTORED",
          oldValue: null,
          newValue: buildStockAuditPayload(restoreConsumedDeltaOnSameDriver, {
            driverId: targetDriverId,
            driverName: targetDriverName,
            reason: "delivered_items_changed",
          }),
        });
      }
    }

    if (auditChanges.length === 0) {
      return NextResponse.json(order);
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (didChangeCustomerPhone) {
        const isolatedCustomer = await tx.customer.create({
          data: {
            name: order.customer.name,
            email: order.customer.email || undefined,
            phone: nextCustomerPhone,
            address: nextCustomerAddress || undefined,
            district: order.customer.district || undefined,
            city: order.customer.city || "Улаанбаатар",
            notes: order.customer.notes || undefined,
          },
          select: { id: true },
        });

        updateData.customer = {
          connect: { id: isolatedCustomer.id },
        };
      }

      if (Object.prototype.hasOwnProperty.call(body, "shippingAddress")) {
        const nextAddress = String(body.shippingAddress ?? "").trim();
        if (!didChangeCustomerPhone && nextAddress !== (order.customer.address ?? "")) {
          await tx.customer.update({
            where: { id: order.customerId },
            data: { address: nextAddress || null },
          });
        }
      }

      if (Object.prototype.hasOwnProperty.call(body, "customerPhone")) {
        const nextPhone = String(body.customerPhone ?? "").trim();
        if (!didChangeCustomerPhone && nextPhone && nextPhone !== (order.customer.phone ?? "")) {
          await tx.customer.update({
            where: { id: order.customerId },
            data: { phone: nextPhone },
          });
        }
      }

      if (didChangeDriver) {
        if (targetDriverId && nextDriverAgentId) {
          // Keep delivery assignment agent in sync with order.assignedTo to avoid stale driver lists.
          await tx.deliveryAssignment.updateMany({
            where: { orderId: id },
            data: { agentId: nextDriverAgentId },
          });
        } else if (!targetDriverId) {
          await tx.deliveryAssignment.deleteMany({
            where: { orderId: id },
          });
        }
      }

      if (!wasDriverStockConsumed && willDriverStockConsumed && targetDriverId) {
        const requiredByProduct = new Map<string, { qty: number; name: string }>();
        for (const item of nextItemsForStockValidation) {
          const previous = requiredByProduct.get(item.productId);
          requiredByProduct.set(item.productId, {
            qty: (previous?.qty ?? 0) + item.qty,
            name: item.name,
          });
        }

        for (const [productId, required] of Array.from(requiredByProduct.entries())) {
          const updateResult = await tx.driverStock.updateMany({
            where: {
              driverId: targetDriverId,
              productId,
              quantity: { gte: required.qty },
            },
            data: { quantity: { decrement: required.qty } },
          });
          if (updateResult.count === 0) {
            throw new Error(`INSUFFICIENT_DRIVER_STOCK:${required.name}`);
          }
        }
      }

      if (wasDriverStockConsumed && !willDriverStockConsumed && oldDriverId) {
        const restoredByProduct = new Map<string, { qty: number; name: string }>();
        for (const item of currentItemsForStock) {
          const previous = restoredByProduct.get(item.productId);
          restoredByProduct.set(item.productId, {
            qty: (previous?.qty ?? 0) + item.qty,
            name: item.name,
          });
        }

        for (const [productId, restored] of Array.from(restoredByProduct.entries())) {
          await tx.driverStock.upsert({
            where: {
              driverId_productId: {
                driverId: oldDriverId,
                productId,
              },
            },
            update: {
              quantity: { increment: restored.qty },
            },
            create: {
              driverId: oldDriverId,
              productId,
              quantity: restored.qty,
            },
          });
        }
      }

      if (isDriverReassignmentWhileStockConsumed && oldDriverId && targetDriverId) {
        const oldDriverRestore = new Map<string, { qty: number; name: string }>();
        for (const item of currentItemsForStock) {
          const previous = oldDriverRestore.get(item.productId);
          oldDriverRestore.set(item.productId, {
            qty: (previous?.qty ?? 0) + item.qty,
            name: item.name,
          });
        }

        for (const [productId, restored] of Array.from(oldDriverRestore.entries())) {
          await tx.driverStock.upsert({
            where: {
              driverId_productId: {
                driverId: oldDriverId,
                productId,
              },
            },
            update: {
              quantity: { increment: restored.qty },
            },
            create: {
              driverId: oldDriverId,
              productId,
              quantity: restored.qty,
            },
          });
        }

        const newDriverDeduction = new Map<string, { qty: number; name: string }>();
        for (const item of nextItemsForStockValidation) {
          const previous = newDriverDeduction.get(item.productId);
          newDriverDeduction.set(item.productId, {
            qty: (previous?.qty ?? 0) + item.qty,
            name: item.name,
          });
        }

        for (const [productId, required] of Array.from(newDriverDeduction.entries())) {
          const updateResult = await tx.driverStock.updateMany({
            where: {
              driverId: targetDriverId,
              productId,
              quantity: { gte: required.qty },
            },
            data: {
              quantity: { decrement: required.qty },
            },
          });

          if (updateResult.count === 0) {
            throw new Error(`INSUFFICIENT_DRIVER_STOCK:${required.name}`);
          }
        }
      }

      if (wasDriverStockConsumed && willDriverStockConsumed && oldDriverId === targetDriverId && targetDriverId) {
        for (const item of consumeDeltaOnSameDriver) {
          const updateResult = await tx.driverStock.updateMany({
            where: {
              driverId: targetDriverId,
              productId: item.productId,
              quantity: { gte: item.qty },
            },
            data: {
              quantity: { decrement: item.qty },
            },
          });

          if (updateResult.count === 0) {
            throw new Error(`INSUFFICIENT_DRIVER_STOCK:${item.name}`);
          }
        }

        for (const item of restoreConsumedDeltaOnSameDriver) {
          await tx.driverStock.upsert({
            where: {
              driverId_productId: {
                driverId: targetDriverId,
                productId: item.productId,
              },
            },
            update: {
              quantity: { increment: item.qty },
            },
            create: {
              driverId: targetDriverId,
              productId: item.productId,
              quantity: item.qty,
            },
          });
        }
      }

      return tx.order.update({
        where: { id },
        data: {
          ...updateData,
          auditLogs: {
            create: auditChanges,
          },
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
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          assignedTo: { select: { id: true, name: true } },
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
      });
    }, {
      maxWait: 45000,
      timeout: 45000,
    });

    if (didChangeDriver && targetDriverId && targetDriverEmail && targetDriverReceiveNotifications) {
      try {
        await sendDriverAssignmentEmail({
          driverEmail: targetDriverEmail,
          driverName: targetDriverName ?? updated.assignedTo?.name ?? "Driver",
          orderNumber: updated.orderNumber,
          customerName: updated.customer.name,
          customerPhone: updated.customer.phone,
          shippingAddress: updated.shippingAddress ?? updated.customer.address ?? null,
          status: String(updated.status ?? ""),
          assignedBy: session.user.name ?? "Operator",
          items: updated.items.map((item) => ({
            name: item.name,
            qty: Number(item.qty),
          })),
          totalAmount: Number(updated.total),
        });
      } catch (emailError) {
        console.error("Failed to send driver assignment email", emailError);
      }
    }

    return NextResponse.json(updated);
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

    console.error(err);
    return NextResponse.json({ error: "Алдаа гарлаа" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<Params> }) {
  try {
    const { id } = await params;

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Нэвтрэх шаардлагатай" }, { status: 401 });
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });

    const role = String(dbUser?.role ?? session.user.role ?? "").toUpperCase();
    if (role !== "ADMIN") {
      return NextResponse.json({ error: "Зөвхөн админ устгах эрхтэй" }, { status: 403 });
    }

    const existing = await prisma.order.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Захиалга олдсонгүй" }, { status: 404 });
    }

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.deliveryAssignment.deleteMany({ where: { orderId: id } });
      await tx.orderAuditLog.deleteMany({ where: { orderId: id } });
      await tx.order.delete({ where: { id } });
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Алдаа гарлаа" }, { status: 500 });
  }
}
