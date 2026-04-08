const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const driverName = 'Uuganbayar';
  const productNeedle = 'Машины шил цэвэрлэгч';
  const rows = await prisma.$queryRaw`
    SELECT o.orderNumber, l.orderId, l.action, l.oldValue, l.newValue, l.createdAt
    FROM orders o
    JOIN users u ON u.id = o.assignedToId
    JOIN order_items oi ON oi.orderId = o.id
    JOIN products p ON p.id = oi.productId
    JOIN order_audit_logs l ON l.orderId = o.id
    WHERE u.name = ${driverName}
      AND p.name LIKE CONCAT('%', ${productNeedle}, '%')
      AND l.action = 'STATUS_CHANGED'
    ORDER BY o.orderNumber, l.createdAt DESC;
  `;
  for (const r of rows) {
    console.log([r.orderNumber, new Date(r.createdAt).toISOString(), r.oldValue, '=>', r.newValue].join('\t'));
  }
})();
