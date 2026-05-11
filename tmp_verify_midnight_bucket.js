const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const BUSINESS_UTC_OFFSET_MINUTES = 8 * 60;

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function businessDateKey(date) {
  const shifted = new Date(date.getTime() + BUSINESS_UTC_OFFSET_MINUTES * 60 * 1000);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const day = String(shifted.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function main() {
  // UB 2026-04-15 00:14:00 -> UTC 2026-04-14 16:14:00
  const fromUtc = new Date('2026-04-14T16:14:00.000Z');
  const toUtc = new Date('2026-04-14T16:20:59.999Z');

  const logs = await prisma.orderAuditLog.findMany({
    where: {
      action: 'STATUS_CHANGED',
      newValue: 'DELIVERED',
      createdAt: { gte: fromUtc, lte: toUtc },
    },
    select: { orderId: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  const oldBuckets = {};
  const newBuckets = {};

  for (const log of logs) {
    const oldKey = dateKey(log.createdAt);
    const newKey = businessDateKey(log.createdAt);
    oldBuckets[oldKey] = (oldBuckets[oldKey] || 0) + 1;
    newBuckets[newKey] = (newBuckets[newKey] || 0) + 1;
  }

  console.log('logs found:', logs.length);
  console.log('old bucket(dateKey):', oldBuckets);
  console.log('new bucket(businessDateKey):', newBuckets);
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
