const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  const driverId = 'cmn0ergew0002fugm1fckmea7';
  
  // Test for 3/27
  const dayStart = new Date('2026-03-27');
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date('2026-03-27');
  dayEnd.setUTCHours(23, 59, 59, 999);
  
  console.log('=== TESTING PRISMA QUERY FOR 3/27 ===');
  console.log('dayStart:', dayStart.toISOString());
  console.log('dayEnd:', dayEnd.toISOString());
  
  // Test 1: All orders for this driver on 3/27 with any timeSlot
  console.log('\n=== TEST 1: Orders with timeSlot date = 3/27 ===');
  const ordersWithSlot = await prisma.order.findMany({
    where: {
      assignedToId: driverId,
      delivery: {
        timeSlot: {
          date: {
            gte: dayStart,
            lte: dayEnd
          }
        }
      }
    },
    include: {
      customer: { select: { phone: true } },
      delivery: { include: { timeSlot: true } }
    }
  });
  
  console.log('Found:', ordersWithSlot.length);
  ordersWithSlot.forEach(o => {
    console.log(`  - ${o.orderNumber} (${o.customer.phone}) Status: ${o.status}`);
  });
  
  // Test 2: Same as the first OR condition in the API
  console.log('\n=== TEST 2: Using first OR condition (timeSlot match, NOT PENDING) ===');
  const firstOrCondition = await prisma.order.findMany({
    where: {
      assignedToId: driverId,
      status: { not: "PENDING" },
      delivery: {
        is: {
          timeSlot: {
            is: {
              date: {
                gte: dayStart,
                lte: dayEnd
              }
            }
          }
        }
      }
    },
    include: {
      customer: { select: { phone: true } },
      delivery: { include: { timeSlot: true } }
    }
  });
  
  console.log('Found:', firstOrCondition.length);
  firstOrCondition.forEach(o => {
    console.log(`  - ${o.orderNumber} (${o.customer.phone}) Status: ${o.status}`);
  });
  
  // Test 3: Check the specific order
  console.log('\n=== TEST 3: Check specific order ===');
  const order = await prisma.order.findFirst({
    where: { customer: { phone: '88166030' } },
    include: {
      delivery: { include: { timeSlot: true } }
    }
  });
  
  if (order) {
    console.log('Order found:');
    console.log('  ID:', order.id);
    console.log('  Status:', order.status);
    console.log('  Has delivery?', order.delivery ? 'YES' : 'NO');
    if (order.delivery) {
      console.log('  Delivery ID:', order.delivery.id);
      console.log('  Has timeSlot?', order.delivery.timeSlot ? 'YES' : 'NO');
      if (order.delivery.timeSlot) {
        const slotDate = new Date(order.delivery.timeSlot.date);
        console.log('  TimeSlot date:', slotDate.toISOString());
        console.log('  Matches 3/27 range?', slotDate >= dayStart && slotDate <= dayEnd ? 'YES' : 'NO');
      }
    }
  }
  
})().catch(console.error).finally(() => prisma.$disconnect());
