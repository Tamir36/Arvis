const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  // First find ALL orders for this phone
  console.log('=== FINDING ALL ORDERS FOR PHONE 88166030 ===');
  const allOrders = await prisma.order.findMany({
    where: {
      customer: {
        phone: '88166030'
      }
    },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      delivery: {
        select: {
          id: true,
          status: true,
          timeSlot: {
            select: { date: true, id: true }
          }
        }
      }
    }
  });
  
  console.log('Total orders found:', allOrders.length);
  allOrders.forEach((order, i) => {
    console.log(`\n[${i+1}] ID: ${order.id}`);
    console.log(`    Number: ${order.orderNumber}`);
    console.log(`    Status: ${order.status}`);
    console.log(`    Created: ${order.createdAt}`);
    console.log(`    Updated: ${order.updatedAt}`);
    if (order.delivery) {
      console.log(`    Delivery Status: ${order.delivery.status}`);
      console.log(`    TimeSlot Date: ${order.delivery.timeSlot?.date}`);
    }
  });
})().catch(console.error).finally(() => prisma.$disconnect());
