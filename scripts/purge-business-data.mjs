import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const force = process.argv.includes("--force");
  if (!force) {
    console.error("Refusing to run without --force flag.");
    process.exit(1);
  }

  console.log("Purging all app data except user accounts...");

  // Order-related
  await prisma.orderAuditLog.deleteMany({});
  await prisma.deliveryAssignment.deleteMany({});
  await prisma.timeSlot.deleteMany({});
  await prisma.deliveryZone.deleteMany({});
  await prisma.orderItem.deleteMany({});
  await prisma.order.deleteMany({});
  await prisma.coupon.deleteMany({});

  // Customer-related
  await prisma.customer.deleteMany({});

  // Product-related dependencies
  await prisma.stockMovement.deleteMany({});
  await prisma.inventoryTransferItem.deleteMany({});
  await prisma.inventoryTransfer.deleteMany({});
  await prisma.driverStock.deleteMany({});
  await prisma.priceHistory.deleteMany({});
  await prisma.productVariant.deleteMany({});
  await prisma.productImage.deleteMany({});
  await prisma.inventory.deleteMany({});
  await prisma.bundleItem.deleteMany({});
  await prisma.bundle.deleteMany({});

  // Product records
  await prisma.product.deleteMany({});

  // Catalog metadata
  await prisma.category.deleteMany({});

  console.log("App data purge completed. User accounts were preserved.");
}

main()
  .catch((error) => {
    console.error("Business data purge failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
