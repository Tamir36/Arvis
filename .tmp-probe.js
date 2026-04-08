const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const driverName = 'Uuganbayar';
  const productNeedle = 'Машины шил цэвэрлэгч';
  const utcStart = new Date('2026-04-06T16:00:00.000Z');
  const utcEnd = new Date('2026-04-07T15:59:59.999Z');

  const rows = await prisma.$queryRaw`
    SELECT DISTINCT o.orderNumber, o.id
    FROM orders o
    INNER JOIN users u ON u.id = o.assignedToId
    INNER JOIN order_items oi ON oi.orderId = o.id
    INNER JOIN products p ON p.id = oi.productId
    INNER JOIN order_audit_logs l ON l.orderId = o.id
    WHERE u.name = ${driverName}
      AND p.name LIKE CONCAT('%', ${productNeedle}, '%')
      AND l.createdAt BETWEEN ${utcStart} AND ${utcEnd}
    ORDER BY o.orderNumber;
  `;
  console.log('orders:', rows.length);
  console.log(rows.slice(0,20));
})();
