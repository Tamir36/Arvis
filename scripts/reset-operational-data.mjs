import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function run() {
  const before = {
    inventories: await prisma.inventory.count(),
    driverStocks: await prisma.driverStock.count(),
    stockMovements: await prisma.stockMovement.count(),
    inventoryTransfers: await prisma.inventoryTransfer.count(),
    inventoryTransferItems: await prisma.inventoryTransferItem.count(),
    orders: await prisma.order.count(),
    orderItems: await prisma.orderItem.count(),
    orderAuditLogs: await prisma.orderAuditLog.count(),
    deliveryAssignments: await prisma.deliveryAssignment.count(),
  };

  const deleted = await prisma.$transaction(async (tx) => {
    const inventoryTransferItems = await tx.inventoryTransferItem.deleteMany({});
    const inventoryTransfers = await tx.inventoryTransfer.deleteMany({});
    const stockMovements = await tx.stockMovement.deleteMany({});

    const orderAuditLogs = await tx.orderAuditLog.deleteMany({});
    const deliveryAssignments = await tx.deliveryAssignment.deleteMany({});
    const orderItems = await tx.orderItem.deleteMany({});
    const orders = await tx.order.deleteMany({});

    const driverStocks = await tx.driverStock.deleteMany({});
    const inventories = await tx.inventory.deleteMany({});

    await tx.productVariant.updateMany({ data: { stock: 0 } });

    return {
      inventoryTransferItems: inventoryTransferItems.count,
      inventoryTransfers: inventoryTransfers.count,
      stockMovements: stockMovements.count,
      orderAuditLogs: orderAuditLogs.count,
      deliveryAssignments: deliveryAssignments.count,
      orderItems: orderItems.count,
      orders: orders.count,
      driverStocks: driverStocks.count,
      inventories: inventories.count,
    };
  }, {
    maxWait: 60000,
    timeout: 60000,
  });

  const after = {
    inventories: await prisma.inventory.count(),
    driverStocks: await prisma.driverStock.count(),
    stockMovements: await prisma.stockMovement.count(),
    inventoryTransfers: await prisma.inventoryTransfer.count(),
    inventoryTransferItems: await prisma.inventoryTransferItem.count(),
    orders: await prisma.order.count(),
    orderItems: await prisma.orderItem.count(),
    orderAuditLogs: await prisma.orderAuditLog.count(),
    deliveryAssignments: await prisma.deliveryAssignment.count(),
  };

  console.log(JSON.stringify({ before, deleted, after }, null, 2));
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
