const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const SHIFTED_FROM = new Date('2026-04-13T16:14:00.000Z');
const SHIFTED_TO = new Date('2026-04-13T16:20:59.999Z');

function parseItems(raw) {
  try {
    const parsed = JSON.parse(raw || 'null');
    const items = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.items) ? parsed.items : []);
    return items
      .map((it) => ({ productId: String(it?.productId || ''), qty: Number(it?.qty || 0) }))
      .filter((it) => it.productId && it.qty > 0);
  } catch {
    return [];
  }
}

async function main() {
  const deliveredLogs = await prisma.orderAuditLog.findMany({
    where: {
      action: 'STATUS_CHANGED',
      newValue: 'DELIVERED',
      createdAt: { gte: SHIFTED_FROM, lte: SHIFTED_TO },
    },
    select: { orderId: true, createdAt: true, order: { select: { orderNumber: true } } },
    orderBy: { createdAt: 'asc' },
  });

  const orderIds = Array.from(new Set(deliveredLogs.map((l) => l.orderId)));

  const [orderItems, stockLogs] = await Promise.all([
    prisma.orderItem.findMany({
      where: { orderId: { in: orderIds } },
      select: { orderId: true, qty: true },
    }),
    prisma.orderAuditLog.findMany({
      where: {
        orderId: { in: orderIds },
        action: 'DRIVER_STOCK_DEDUCTED',
      },
      select: { orderId: true, createdAt: true, newValue: true },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  const orderQtyMap = new Map();
  for (const row of orderItems) {
    orderQtyMap.set(row.orderId, (orderQtyMap.get(row.orderId) || 0) + Number(row.qty || 0));
  }

  const deducedQtyMap = new Map();
  const deliveredReasonMap = new Map();
  for (const log of stockLogs) {
    const items = parseItems(log.newValue);
    const qty = items.reduce((s, i) => s + i.qty, 0);
    deducedQtyMap.set(log.orderId, (deducedQtyMap.get(log.orderId) || 0) + qty);

    try {
      const parsed = JSON.parse(log.newValue || 'null');
      const reason = String(parsed?.reason || '').toLowerCase();
      if (reason === 'delivered' || reason === 'delivered_items_changed' || reason === 'reserved_on_create' || reason === 'reserved') {
        deliveredReasonMap.set(log.orderId, true);
      }
    } catch {
      // ignore
    }
  }

  let missingDeduction = 0;
  let qtyMismatch = 0;

  console.log('Orders checked:', orderIds.length);
  for (const log of deliveredLogs) {
    const orderId = log.orderId;
    const expected = orderQtyMap.get(orderId) || 0;
    const deducted = deducedQtyMap.get(orderId) || 0;
    const hasRelevant = deliveredReasonMap.has(orderId);

    const ok = deducted >= expected && hasRelevant;
    if (!ok) {
      if (!hasRelevant || deducted === 0) missingDeduction += 1;
      if (deducted < expected) qtyMismatch += 1;
      console.log(`WARN ${log.order?.orderNumber || orderId} | expected=${expected} deducted=${deducted} hasReason=${hasRelevant}`);
    }
  }

  console.log('Missing deduction orders:', missingDeduction);
  console.log('Qty mismatch orders:', qtyMismatch);
  console.log('Result:', missingDeduction === 0 && qtyMismatch === 0 ? 'OK' : 'NEEDS_REVIEW');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
