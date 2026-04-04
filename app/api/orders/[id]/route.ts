import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { Prisma } from "@prisma/client";

interface Params {
  id: string;
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
            select: { id: true, name: true },
          });

          if (!driver) {
            return NextResponse.json({ error: "Жолооч олдсонгүй" }, { status: 400 });
          }

          nextDriverName = driver.name;
          targetDriverName = driver.name;

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
        }

        // Check stock for the new driver BEFORE updating status
        if (
          nextDriverId
          && ["PENDING", "CONFIRMED", "SHIPPED"].includes(String(order.status))
          && !Array.isArray(body.items)
        ) {
          await ensureDriverHasStock(nextDriverId, nextItemsForStockValidation);
        }

        if (nextDriverId && ["PENDING", "CONFIRMED", "SHIPPED"].includes(String(nextStatus))) {
          nextStatus = "CONFIRMED";
        }

        if (!nextDriverId && ["CONFIRMED", "SHIPPED"].includes(String(nextStatus))) {
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

    const isBecomingDelivered =
      nextStatus === "DELIVERED" && String(order.status) !== "DELIVERED";
    const isLeavingDelivered =
      String(order.status) === "DELIVERED" && nextStatus !== "DELIVERED";
    const hasPriorDeliveredStockDeduction = order.auditLogs.length > 0;
    const shouldRestoreStockOnLeavingDelivered = isLeavingDelivered && hasPriorDeliveredStockDeduction;
    const isDeliveredDriverReassignment =
      String(order.status) === "DELIVERED"
      && nextStatus === "DELIVERED"
      && didChangeDriver
      && order.assignedToId !== targetDriverId;
    const isDeliveredItemsChangedWithSameDriver =
      String(order.status) === "DELIVERED"
      && nextStatus === "DELIVERED"
      && didChangeItems
      && !didChangeDriver
      && Boolean(targetDriverId)
      && targetDriverId === order.assignedToId;
    const deliveredPositiveDelta = isDeliveredItemsChangedWithSameDriver
      ? buildPositiveStockDelta(
          order.items.map((item) => ({
            productId: item.productId,
            qty: Number(item.qty),
            name: item.name,
          })),
          nextItemsForStockValidation,
        )
      : [];
    const deliveredRestoreDelta = isDeliveredItemsChangedWithSameDriver
      ? buildPositiveStockDelta(
          nextItemsForStockValidation,
          order.items.map((item) => ({
            productId: item.productId,
            qty: Number(item.qty),
            name: item.name,
          })),
        )
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

    const shouldCheckDriverStock =
      ["PENDING", "CONFIRMED", "SHIPPED"].includes(String(nextStatus))
      && (didChangeDriver || didChangeItems)
      && !(String(order.status) === "DELIVERED" && targetDriverId === order.assignedToId);

    if (targetDriverId && shouldCheckDriverStock) {
      const itemsForStockCheck = (
        didChangeItems
        && !didChangeDriver
        && targetDriverId === order.assignedToId
      )
        ? buildPositiveStockDelta(
            order.items.map((item) => ({
              productId: item.productId,
              qty: Number(item.qty),
              name: item.name,
            })),
            nextItemsForStockValidation,
          )
        : nextItemsForStockValidation;

      if (itemsForStockCheck.length > 0) {
        await ensureDriverHasStock(targetDriverId, itemsForStockCheck);
      }
    }

    if (targetDriverId && deliveredPositiveDelta.length > 0) {
      await ensureDriverHasStock(targetDriverId, deliveredPositiveDelta);
    }

    if (isDeliveredDriverReassignment && targetDriverId) {
      // Driver changed while order remains DELIVERED: stock must move to the new driver.
      await ensureDriverHasStock(targetDriverId, nextItemsForStockValidation);
    }

    if (isBecomingDelivered) {
      auditChanges.push({
        userId: session.user.id,
        action: "DRIVER_STOCK_DEDUCTED",
        oldValue: null,
        newValue: buildStockAuditPayload(nextItemsForStockValidation, {
          driverId: targetDriverId,
          driverName: targetDriverName,
          reason: "delivered",
        }),
      });
    }

    if (targetDriverId && deliveredPositiveDelta.length > 0) {
      auditChanges.push({
        userId: session.user.id,
        action: "DRIVER_STOCK_DEDUCTED",
        oldValue: null,
        newValue: buildStockAuditPayload(deliveredPositiveDelta, {
          driverId: targetDriverId,
          driverName: targetDriverName,
          reason: "delivered_items_changed",
        }),
      });
    }

    if (targetDriverId && deliveredRestoreDelta.length > 0) {
      auditChanges.push({
        userId: session.user.id,
        action: "DRIVER_STOCK_RESTORED",
        oldValue: null,
        newValue: buildStockAuditPayload(deliveredRestoreDelta, {
          driverId: targetDriverId,
          driverName: targetDriverName,
          reason: "delivered_items_changed",
        }),
      });
    }

    if (shouldRestoreStockOnLeavingDelivered) {
      auditChanges.push({
        userId: session.user.id,
        action: "DRIVER_STOCK_RESTORED",
        oldValue: null,
        newValue: buildStockAuditPayload(nextItemsForStockValidation, {
          driverId: order.assignedToId,
          driverName: order.assignedTo?.name ?? null,
          reason: nextStatus === "CANCELLED" ? "cancelled" : "restored",
        }),
      });
    }

    if (isDeliveredDriverReassignment) {
      auditChanges.push({
        userId: session.user.id,
        action: "DRIVER_STOCK_RESTORED",
        oldValue: null,
        newValue: buildStockAuditPayload(nextItemsForStockValidation, {
          driverId: order.assignedToId,
          driverName: order.assignedTo?.name ?? null,
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
          reason: "driver_reassigned",
        }),
      });
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

      if (isBecomingDelivered) {
        const requiredByProduct = new Map<string, { qty: number; name: string }>();
        for (const item of nextItemsForStockValidation) {
          const previous = requiredByProduct.get(item.productId);
          requiredByProduct.set(item.productId, {
            qty: (previous?.qty ?? 0) + item.qty,
            name: item.name,
          });
        }

        if (targetDriverId) {
          // Deduct from assigned driver's stock
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
        } else {
          // No driver assigned: deduct from warehouse inventory
          for (const [productId, required] of Array.from(requiredByProduct.entries())) {
            await tx.inventory.updateMany({
              where: { productId },
              data: { quantity: { decrement: required.qty } },
            });
          }
        }
      }

      if (targetDriverId && deliveredPositiveDelta.length > 0) {
        for (const item of deliveredPositiveDelta) {
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
      }

      if (targetDriverId && deliveredRestoreDelta.length > 0) {
        for (const item of deliveredRestoreDelta) {
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

      if (shouldRestoreStockOnLeavingDelivered) {
        const restoredByProduct = new Map<string, { qty: number; name: string }>();
        for (const item of nextItemsForStockValidation) {
          const previous = restoredByProduct.get(item.productId);
          restoredByProduct.set(item.productId, {
            qty: (previous?.qty ?? 0) + item.qty,
            name: item.name,
          });
        }

        if (order.assignedToId) {
          // Restore back to the original assigned driver's stock that was deducted on delivery.
          for (const [productId, restored] of Array.from(restoredByProduct.entries())) {
            await tx.driverStock.upsert({
              where: {
                driverId_productId: {
                  driverId: order.assignedToId,
                  productId,
                },
              },
              update: {
                quantity: { increment: restored.qty },
              },
              create: {
                driverId: order.assignedToId,
                productId,
                quantity: restored.qty,
              },
            });
          }
        } else {
          // If delivery was deducted from warehouse stock, restore back to warehouse.
          for (const [productId, restored] of Array.from(restoredByProduct.entries())) {
            await tx.inventory.updateMany({
              where: { productId },
              data: { quantity: { increment: restored.qty } },
            });
          }
        }
      }

      if (isDeliveredDriverReassignment) {
        const movedByProduct = new Map<string, { qty: number; name: string }>();
        for (const item of nextItemsForStockValidation) {
          const previous = movedByProduct.get(item.productId);
          movedByProduct.set(item.productId, {
            qty: (previous?.qty ?? 0) + item.qty,
            name: item.name,
          });
        }

        if (order.assignedToId) {
          // Return deducted stock to the old driver.
          for (const [productId, moved] of Array.from(movedByProduct.entries())) {
            await tx.driverStock.upsert({
              where: {
                driverId_productId: {
                  driverId: order.assignedToId,
                  productId,
                },
              },
              update: {
                quantity: { increment: moved.qty },
              },
              create: {
                driverId: order.assignedToId,
                productId,
                quantity: moved.qty,
              },
            });
          }
        }

        if (targetDriverId) {
          // Deduct the same stock from the newly assigned driver.
          for (const [productId, moved] of Array.from(movedByProduct.entries())) {
            const updateResult = await tx.driverStock.updateMany({
              where: {
                driverId: targetDriverId,
                productId,
                quantity: { gte: moved.qty },
              },
              data: {
                quantity: { decrement: moved.qty },
              },
            });

            if (updateResult.count === 0) {
              throw new Error(`INSUFFICIENT_DRIVER_STOCK:${moved.name}`);
            }
          }
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

    return NextResponse.json(updated);
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
