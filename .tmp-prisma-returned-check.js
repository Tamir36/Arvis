const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const orderNumbers = [
  'ORD-2026-48001',
  'ORD-2026-54269',
  'ORD-2026-02179',
  'ORD-2026-97434',
  'ORD-2026-89774',
  'ORD-2026-80802',
  'ORD-2026-77078',
];

function hasReturned(value) {
  if (typeof value !== 'string') return false;
  return value.toUpperCase().includes('RETURNED');
}

(async () => {
  try {
    const orders = await prisma.order.findMany({
      where: { orderNumber: { in: orderNumbers } },
      select: {
        orderNumber: true,
        updatedAt: true,
        auditLogs: {
          where: { action: 'STATUS_CHANGED' },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true, newValue: true },
        },
      },
    });

    const byOrder = new Map(orders.map((o) => [o.orderNumber, o]));
    const ubFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ulaanbaatar', year: 'numeric', month: '2-digit', day: '2-digit'
    });

    const rows = orderNumbers.map((orderNumber) => {
      const order = byOrder.get(orderNumber);
      if (!order) return { orderNumber, latestReturnedAtUTC: null, updatedAtUTC: null, ubDate: null };

      const latestReturned = order.auditLogs.find((l) => hasReturned(l.newValue));
      const ts = latestReturned?.createdAt ?? null;
      return {
        orderNumber,
        latestReturnedAtUTC: ts ? ts.toISOString() : null,
        updatedAtUTC: order.updatedAt ? order.updatedAt.toISOString() : null,
        ubDate: ts ? ubFormatter.format(ts) : null,
      };
    });

    const countOnUbDay = rows.filter((r) => r.ubDate === '2026-04-08').length;

    console.table(rows.map(r => ({ orderNumber: r.orderNumber, latestReturnedAtUTC: r.latestReturnedAtUTC, updatedAtUTC: r.updatedAtUTC })));
    console.log(`countLatestReturnedOn2026-04-08_UB=${countOnUbDay}`);
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
