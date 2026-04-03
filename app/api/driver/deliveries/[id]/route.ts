import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

interface Params {
  id: string;
}

const DRIVER_STATUS_VALUES = new Set(["DELIVERED", "LATE_DELIVERED", "RETURNED", "CANCELLED"]);
const STOCK_DEDUCTED_STATUSES = new Set(["DELIVERED"]);

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function nextDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, 0, 0, 0, 0);
}

export async function PATCH(req: NextRequest, { params }: { params: Params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Нэвтрэх шаардлагатай" }, { status: 401 });
    }

    const role = String(session.user.role ?? "").toUpperCase();
    if (role !== "DRIVER") {
      return NextResponse.json({ error: "Зөвхөн жолооч хандах боломжтой" }, { status: 403 });
    }

    const body = await req.json();
    const nextStatusInput = String(body.status ?? "").trim().toUpperCase();

    if (!DRIVER_STATUS_VALUES.has(nextStatusInput)) {
      return NextResponse.json({ error: "Буруу төлөв" }, { status: 400 });
    }

    const isLateDelivered = nextStatusInput === "LATE_DELIVERED";
    const nextStatus = isLateDelivered ? "DELIVERED" : nextStatusInput;

    const updatedOrder = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: {
          id: params.id,
          assignedToId: session.user.id,
        },
        include: {
          items: {
            select: {
              productId: true,
              name: true,
              qty: true,
            },
          },
          delivery: {
            include: {
              timeSlot: true,
            },
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
        throw new Error("NOT_FOUND");
      }

      const previousStatus = String(order.status);
      const shouldDeduct = !STOCK_DEDUCTED_STATUSES.has(previousStatus) && STOCK_DEDUCTED_STATUSES.has(nextStatus);
      // Restore stock when leaving DELIVERED state so cancellation can return quantity back.
      const shouldRestore = STOCK_DEDUCTED_STATUSES.has(previousStatus) && !STOCK_DEDUCTED_STATUSES.has(nextStatus);
      // Delete the DEDUCTED audit log whenever leaving DELIVERED state (CANCELLED or RETURNED).
      const shouldDeleteDeductedLog = STOCK_DEDUCTED_STATUSES.has(previousStatus) && !STOCK_DEDUCTED_STATUSES.has(nextStatus);
      // Keep restore log for both CANCELLED and RETURNED flows.
      const shouldLogRestore = shouldRestore;

      const now = new Date();
      const updateData: Prisma.OrderUpdateInput = {
        status: nextStatus as any,
      };

      // When driver marks as RETURNED, always move to tomorrow from "now".
      const scheduledDate = nextStatus === "RETURNED" ? nextDay(now) : startOfDay(now);

      const driverAgent = await tx.deliveryAgent.findUnique({
        where: { userId: session.user.id },
        select: { id: true },
      });

      if (!driverAgent) {
        throw new Error("DRIVER_AGENT_NOT_FOUND");
      }

      const timeSlot = await tx.timeSlot.create({
        data: {
          date: scheduledDate,
          startTime: "09:00",
          endTime: "21:00",
          maxOrders: 100,
          bookedCount: 0,
          isActive: true,
        },
        select: { id: true },
      });

      await tx.deliveryAssignment.upsert({
        where: { orderId: order.id },
        update: {
          agentId: driverAgent.id,
          timeSlotId: timeSlot.id,
          status: nextStatus,
          notes: isLateDelivered ? "Орой хүргэсэн" : undefined,
        },
        create: {
          orderId: order.id,
          agentId: driverAgent.id,
          timeSlotId: timeSlot.id,
          status: nextStatus,
          notes: isLateDelivered ? "Орой хүргэсэн" : null,
        },
      });

      if (shouldDeduct) {
        const requiredByProduct = new Map<string, { qty: number; name: string }>();
        for (const item of order.items) {
          const previous = requiredByProduct.get(item.productId);
          requiredByProduct.set(item.productId, {
            qty: (previous?.qty ?? 0) + item.qty,
            name: item.name,
          });
        }

        for (const [productId, required] of Array.from(requiredByProduct.entries())) {
          const updateResult = await tx.driverStock.updateMany({
            where: {
              driverId: session.user.id,
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

      if (shouldDeleteDeductedLog) {
        // Remove the deduction audit log (CANCELLED = no log needed; RETURNED = will add RESTORED log below)
        await tx.orderAuditLog.deleteMany({
          where: {
            orderId: order.id,
            action: "DRIVER_STOCK_DEDUCTED",
          },
        });
      }

      if (shouldRestore) {
        for (const item of order.items) {
          await tx.driverStock.upsert({
            where: {
              driverId_productId: {
                driverId: session.user.id,
                productId: item.productId,
              },
            },
            update: {
              quantity: {
                increment: item.qty,
              },
            },
            create: {
              driverId: session.user.id,
              productId: item.productId,
              quantity: item.qty,
            },
          });
        }
      }

      const auditChanges: Prisma.OrderAuditLogCreateWithoutOrderInput[] = [
        {
          user: { connect: { id: session.user.id } },
          action: "STATUS_CHANGED",
          oldValue: previousStatus,
          newValue: nextStatus,
        },
      ];

      if (isLateDelivered) {
        auditChanges.push({
          user: { connect: { id: session.user.id } },
          action: "LATE_DELIVERY_MARKED",
          oldValue: null,
          newValue: "Орой хүргэсэн",
        });
      }

      if (shouldDeduct) {
        auditChanges.push({
          user: { connect: { id: session.user.id } },
          action: "DRIVER_STOCK_DEDUCTED",
          oldValue: null,
          newValue: JSON.stringify(order.items.map((item) => ({
            productId: item.productId,
            name: item.name,
            qty: item.qty,
          }))),
        });
      }

      if (shouldLogRestore) {
        auditChanges.push({
          user: { connect: { id: session.user.id } },
          action: "DRIVER_STOCK_RESTORED",
          oldValue: null,
          newValue: JSON.stringify({
            driverId: session.user.id,
            driverName: order.assignedTo?.name ?? session.user.name ?? null,
            reason: nextStatus === "CANCELLED" ? "cancelled" : "restored",
            items: order.items.map((item) => ({
              productId: item.productId,
              name: item.name,
              qty: item.qty,
            })),
          }),
        });
      }

      return tx.order.update({
        where: { id: order.id },
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
            select: {
              id: true,
              name: true,
              qty: true,
              unitPrice: true,
            },
          },
          assignedTo: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });
    }, {
      maxWait: 45000,
      timeout: 45000,
    });

    return NextResponse.json(updatedOrder);
  } catch (error: any) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Захиалга олдсонгүй" }, { status: 404 });
    }

    if (error instanceof Error && error.message === "DRIVER_AGENT_NOT_FOUND") {
      return NextResponse.json({ error: "Жолоочийн хүргэлтийн профайл олдсонгүй" }, { status: 400 });
    }

    if (error instanceof Error && error.message.startsWith("INSUFFICIENT_DRIVER_STOCK:")) {
      const productName = error.message.split(":").slice(1).join(":") || "Бараа";
      return NextResponse.json({ error: `${productName} бараа дууссан байна` }, { status: 400 });
    }

    console.error(error);
    return NextResponse.json({ error: "Алдаа гарлаа" }, { status: 500 });
  }
}
