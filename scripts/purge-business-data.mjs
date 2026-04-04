import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const force = process.argv.includes("--force");
  if (!force) {
    console.error("Refusing to run without --force flag.");
    process.exit(1);
  }

  console.log("Purging business data: orders, customers, and products...");

  await prisma.$transaction(async (tx) => {
    // Order-related
    await tx.orderAuditLog.deleteMany({});
    await tx.deliveryAssignment.deleteMany({});
    await tx.orderItem.deleteMany({});
    await tx.order.deleteMany({});

    // Customer-related
    await tx.customer.deleteMany({});

    // Product-related dependencies
    await tx.stockMovement.deleteMany({});
    await tx.inventoryTransferItem.deleteMany({});
    await tx.inventoryTransfer.deleteMany({});
    await tx.driverStock.deleteMany({});
    await tx.priceHistory.deleteMany({});
    await tx.productVariant.deleteMany({});
    await tx.productImage.deleteMany({});
    await tx.inventory.deleteMany({});
    await tx.bundleItem.deleteMany({});

    // Product records
    await tx.product.deleteMany({});
  });

  console.log("Business data purge completed.");
}

main()
  .catch((error) => {
    console.error("Business data purge failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
