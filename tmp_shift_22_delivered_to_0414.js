const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const FROM = new Date('2026-04-14T16:14:00.000Z');
const TO = new Date('2026-04-14T16:20:59.999Z');
const SHIFT_MS = 24 * 60 * 60 * 1000;
const DRY_RUN = !process.argv.includes('--apply');

async function main() {
  const rows = await prisma.orderAuditLog.findMany({
    where: {
      action: 'STATUS_CHANGED',
      newValue: 'DELIVERED',
      createdAt: { gte: FROM, lte: TO },
    },
    select: {
      id: true,
      orderId: true,
      createdAt: true,
      order: { select: { orderNumber: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  console.log('Matched logs:', rows.length);
  if (rows.length === 0) return;

  for (const row of rows) {
    const nextAt = new Date(row.createdAt.getTime() - SHIFT_MS);
    console.log(`${row.order?.orderNumber ?? row.orderId} | ${row.createdAt.toISOString()} -> ${nextAt.toISOString()}`);
  }

  if (DRY_RUN) {
    console.log('\n[DRY RUN] No changes written. Run with --apply to execute.');
    return;
  }

  await prisma.$transaction(
    rows.map((row) => prisma.orderAuditLog.update({
      where: { id: row.id },
      data: { createdAt: new Date(row.createdAt.getTime() - SHIFT_MS) },
    }))
  );

  console.log(`\nUpdated ${rows.length} DELIVERED status logs by -24h.`);
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
