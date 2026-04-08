const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const driverName = 'Uuganbayar';
  const productNeedle = 'Машины шил цэвэрлэгч';
  const utcStart = new Date('2026-04-06T16:00:00.000Z');
  const utcEnd = new Date('2026-04-07T15:59:59.999Z');

  const rows = await prisma.$queryRaw`
    SELECT
      o.orderNumber,
      ld.latestDeliveredAt AS ts,
      GROUP_CONCAT(l.action ORDER BY l.action SEPARATOR ', ') AS actions,
      COUNT(*) AS logCount
    FROM orders o
    INNER JOIN users u ON u.id = o.assignedToId
    INNER JOIN order_items oi ON oi.orderId = o.id
    INNER JOIN products p ON p.id = oi.productId
    INNER JOIN (
      SELECT orderId, MAX(createdAt) AS latestDeliveredAt
      FROM order_audit_logs
      WHERE action = 'STATUS_CHANGED' AND newValue = 'DELIVERED'
      GROUP BY orderId
    ) ld ON ld.orderId = o.id
    INNER JOIN order_audit_logs l ON l.orderId = o.id AND l.createdAt = ld.latestDeliveredAt
    WHERE u.name = ${driverName}
      AND p.name LIKE CONCAT('%', ${productNeedle}, '%')
      AND ld.latestDeliveredAt BETWEEN ${utcStart} AND ${utcEnd}
    GROUP BY o.id, o.orderNumber, ld.latestDeliveredAt
    HAVING COUNT(*) > 1
    ORDER BY ld.latestDeliveredAt DESC, o.orderNumber ASC;
  `;

  if (!rows.length) {
    console.log('No matching orders found.');
    return;
  }
  for (const r of rows) {
    console.log(`${r.orderNumber}\t${new Date(r.ts).toISOString()}\t${r.actions}`);
  }
})();
