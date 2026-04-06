import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const TARGET_STATUSES = ["CONFIRMED", "RETURNED"];

function aggregateItems(items) {
  const byProduct = new Map();
  for (const item of items) {
    const prev = byProduct.get(item.productId);
    byProduct.set(item.productId, {
      qty: (prev?.qty ?? 0) + Number(item.qty ?? 0),
      name: item.name || "Бараа",
    });
  }
  return Array.from(byProduct.entries()).map(([productId, value]) => ({
    productId,
    qty: value.qty,
    name: value.name,
  }));
}

async function run() {
  const orders = await prisma.order.findMany({
    where: {
      assignedToId: { not: null },
      status: { in: TARGET_STATUSES },
    },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      assignedToId: true,
      assignedTo: { select: { name: true } },
      items: { select: { productId: true, qty: true, name: true } },
      auditLogs: {
        where: { action: "DRIVER_STOCK_DEDUCTED" },
        select: { id: true, newValue: true },
      },
    },
  });

  let processed = 0;
  let skippedAlreadyReserved = 0;
  let skippedInsufficient = 0;
  let skippedInvalid = 0;

  for (const order of orders) {
    const hasReservationLog = order.auditLogs.some((log) => {
      if (!log.newValue) return false;
      return (
        log.newValue.includes("reserved")
        || log.newValue.includes("reserved_on_create")
        || log.newValue.includes("legacy_reservation_backfill")
      );
    });

    if (hasReservationLog) {
      skippedAlreadyReserved += 1;
      continue;
    }

    const driverId = order.assignedToId;
    if (!driverId) {
      skippedInvalid += 1;
      continue;
    }

    const required = aggregateItems(order.items);
    if (required.length === 0) {
      skippedInvalid += 1;
      continue;
    }

    try {
      await prisma.$transaction(async (tx) => {
        for (const item of required) {
          const updated = await tx.driverStock.updateMany({
            where: {
              driverId,
              productId: item.productId,
              quantity: { gte: item.qty },
            },
            data: {
              quantity: { decrement: item.qty },
            },
          });

          if (updated.count === 0) {
            throw new Error(`INSUFFICIENT:${item.name}`);
          }
        }

        await tx.orderAuditLog.create({
          data: {
            orderId: order.id,
            userId: driverId,
            action: "DRIVER_STOCK_DEDUCTED",
            oldValue: null,
            newValue: JSON.stringify({
              driverId,
              driverName: order.assignedTo?.name ?? null,
              reason: "legacy_reservation_backfill",
              items: required.map((item) => ({
                productId: item.productId,
                name: item.name,
                qty: item.qty,
              })),
            }),
          },
        });
      });

      processed += 1;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("INSUFFICIENT:")) {
        skippedInsufficient += 1;
        continue;
      }
      throw error;
    }
  }

  console.log(JSON.stringify({
    totalCandidates: orders.length,
    processed,
    skippedAlreadyReserved,
    skippedInsufficient,
    skippedInvalid,
  }, null, 2));
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
