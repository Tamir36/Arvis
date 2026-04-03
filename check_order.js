const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  const orders = await prisma.order.findMany({
    where: {
      customer: {
        phone: '88166030'
      }
    },
    include: {
      customer: true,
      delivery: {
        include: {
          timeSlot: true,
          agent: true
        }
      },
      assignedTo: true,
      auditLogs: {
        orderBy: { createdAt: 'desc' }
      }
    }
  });
  
  console.log('=== ORDERS WITH PHONE 88166030 ===');
  console.log(JSON.stringify(orders, (key, value) => {
    if (value instanceof Date) {
      return value.toISOString();
    }
    return value;
  }, 2));
})().catch(e => console.error('Error:', e)).finally(() => prisma.$disconnect());
