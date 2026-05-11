const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const PRODUCT_ID = 'cmnkdrrfs001kx6rred9yjuon'; // Араатай тоглоом /166 ширхэгтэй/
const DRY_RUN = process.argv.includes('--dry-run'); // pass --dry-run to preview only

async function main() {
  console.log(DRY_RUN ? '[DRY RUN] Changes will NOT be saved.\n' : '[LIVE] Changes WILL be saved.\n');

  // Find all DELIVERED orders that contain this product
  const deliveredItems = await prisma.orderItem.findMany({
    where: {
      productId: PRODUCT_ID,
      order: { status: 'DELIVERED' }
    },
    include: {
      order: {
        select: {
          id: true,
          orderNumber: true,
          status: true,
          assignedToId: true,
          assignedTo: { select: { id: true, name: true } },
        }
      }
    }
  });

  // Find which of these already have a "delivered" or "delivered_items_changed" audit log
  const deliveredOrderIds = deliveredItems.map(i => i.order.id);

  const existingDeliveredLogs = await prisma.orderAuditLog.findMany({
    where: {
      orderId: { in: deliveredOrderIds },
      action: { in: ['DRIVER_STOCK_DEDUCTED', 'DRIVER_STOCK_RESTORED'] },
      newValue: { contains: PRODUCT_ID }
    },
    select: { orderId: true, newValue: true }
  });

  const ordersWithDeliveredLog = new Set();
  for (const log of existingDeliveredLogs) {
    try {
      const parsed = JSON.parse(log.newValue);
      const reason = parsed?.reason ?? '';
      if (reason === 'delivered' || reason === 'delivered_items_changed') {
        ordersWithDeliveredLog.add(log.orderId);
      }
    } catch {}
  }

  const missingOrders = deliveredItems.filter(i => !ordersWithDeliveredLog.has(i.order.id));

  console.log(`Нийт DELIVERED захиалга (энэ барааг агуулсан): ${deliveredItems.length}`);
  console.log(`"delivered" log байгаа захиалга: ${ordersWithDeliveredLog.size}`);
  console.log(`"delivered" log дутуу захиалга: ${missingOrders.length}\n`);

  if (missingOrders.length === 0) {
    console.log('Засах зүйл байхгүй. Бүх захиалганд delivered log байна.');
    process.exit(0);
  }

  // Get the delivery timestamps from STATUS_CHANGED audit logs
  const statusLogs = await prisma.orderAuditLog.findMany({
    where: {
      orderId: { in: missingOrders.map(i => i.order.id) },
      action: 'STATUS_CHANGED',
      newValue: 'DELIVERED'
    },
    select: { orderId: true, createdAt: true, userId: true }
  });

  const deliveredAtMap = new Map();
  const deliveredByMap = new Map();
  for (const log of statusLogs) {
    if (!deliveredAtMap.has(log.orderId)) {
      deliveredAtMap.set(log.orderId, log.createdAt);
      deliveredByMap.set(log.orderId, log.userId);
    }
  }

  // Fallback admin user id
  const adminUser = await prisma.user.findFirst({
    where: { role: 'ADMIN' },
    select: { id: true, name: true }
  });

  console.log('--- Үүсгэх log-ууд ---');
  
  const logsToCreate = [];
  for (const item of missingOrders) {
    const order = item.order;
    const deliveredAt = deliveredAtMap.get(order.id) ?? new Date();
    const userId = deliveredByMap.get(order.id) ?? order.assignedToId ?? adminUser?.id;
    const driverId = order.assignedToId;
    const driverName = order.assignedTo?.name ?? null;

    const newValue = JSON.stringify({
      reason: 'delivered',
      driverId,
      driverName,
      items: [{ productId: PRODUCT_ID, qty: item.qty }]
    });

    console.log(`  ${order.orderNumber} | ${deliveredAt.toISOString().slice(0,19)} | qty: ${item.qty} | жолооч: ${driverName ?? '-'}`);

    logsToCreate.push({
      orderId: order.id,
      userId,
      action: 'DRIVER_STOCK_DEDUCTED',
      oldValue: null,
      newValue,
      createdAt: deliveredAt
    });
  }

  if (!DRY_RUN) {
    // Create all missing logs
    for (const log of logsToCreate) {
      await prisma.orderAuditLog.create({ data: log });
    }
    console.log(`\n✅ ${logsToCreate.length} log амжилттай үүслээ.`);
  } else {
    console.log(`\n[DRY RUN] ${logsToCreate.length} log үүсгэх байсан. --dry-run -г хасаад дахин ажиллуул.`);
  }

  process.exit(0);
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
