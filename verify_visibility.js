const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function startOfDay(date) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

(async () => {
  const driverId = 'cmn0ergew0002fugm1fckmea7'; // Жолооч 1
  
  // Get day boundaries in UTC
  const mar26Start = startOfDay(new Date('2026-03-26'));
  const mar26End = startOfDay(new Date('2026-03-27'));
  const mar27Start = startOfDay(new Date('2026-03-27'));
  const mar27End = startOfDay(new Date('2026-03-28'));
  
  console.log('=== CHECKING 3/26 DRIVER DELIVERIES ===');
  console.log('Time range:', mar26Start.toISOString(), 'to', mar26End.toISOString());
  
  const mar26Orders = await prisma.order.findMany({
    where: {
      assignedToId: driverId,
      OR: [
        // PENDING orders with time slot on 3/26
        {
          AND: [
            { status: 'PENDING' },
            { delivery: { timeSlot: { date: { gte: mar26Start, lt: mar26End } } } }
          ]
        },
        // RETURNED orders that were updated on 3/26
        {
          AND: [
            { status: 'RETURNED' },
            { updatedAt: { gte: mar26Start, lt: mar26End } }
          ]
        }
      ]
    },
    include: {
      delivery: {
        include: { timeSlot: true }
      },
      customer: {
        select: { phone: true }
      }
    }
  });
  
  console.log(`Found ${mar26Orders.length} orders on 3/26:`);
  mar26Orders.forEach(order => {
    console.log(`  - ${order.orderNumber} (${order.customer.phone}) Status: ${order.status}, Updated: ${order.updatedAt.toISOString()}`);
  });
  
  console.log('\n=== CHECKING 3/27 DRIVER DELIVERIES ===');
  console.log('Time range:', mar27Start.toISOString(), 'to', mar27End.toISOString());
  
  const mar27Orders = await prisma.order.findMany({
    where: {
      assignedToId: driverId,
      OR: [
        // PENDING orders with time slot on 3/27
        {
          AND: [
            { status: 'PENDING' },
            { delivery: { timeSlot: { date: { gte: mar27Start, lt: mar27End } } } }
          ]
        },
        // RETURNED orders that were updated on 3/27
        {
          AND: [
            { status: 'RETURNED' },
            { updatedAt: { gte: mar27Start, lt: mar27End } }
          ]
        }
      ]
    },
    include: {
      delivery: {
        include: { timeSlot: true }
      },
      customer: {
        select: { phone: true }
      }
    }
  });
  
  console.log(`Found ${mar27Orders.length} orders on 3/27:`);
  mar27Orders.forEach(order => {
    console.log(`  - ${order.orderNumber} (${order.customer.phone}) Status: ${order.status}, TimeSlot: ${order.delivery.timeSlot.date.toISOString()}`);
  });
  
  // Check if our specific order appears
  console.log('\n=== RESULT SUMMARY ===');
  const order88166030 = await prisma.order.findFirst({
    where: { customer: { phone: '88166030' } },
    include: { customer: true, delivery: { include: { timeSlot: true } } }
  });
  
  if (order88166030) {
    const updatedDateStr = order88166030.updatedAt.toISOString().split('T')[0];
    const slotDateStr = order88166030.delivery?.timeSlot?.date.toISOString().split('T')[0] || 'N/A';
    
    console.log(`Order 88166030 (${order88166030.customer.name}):`);
    console.log(`  Status: ${order88166030.status}`);
    console.log(`  Updated Date (UTC): ${updatedDateStr}`);
    console.log(`  TimeSlot Date (UTC): ${slotDateStr}`);
    
    const inMar26 = mar26Orders.find(o => o.id === order88166030.id);
    const inMar27 = mar27Orders.find(o => o.id === order88166030.id);
    
    console.log(`  Appears in 3/26 list: ${inMar26 ? '✓ YES' : '✗ NO'}`);
    console.log(`  Appears in 3/27 list: ${inMar27 ? '✓ YES' : '✗ NO'}`);
    
    if (inMar26 && inMar27) {
      console.log('  ⚠️  WARNING: Appears in BOTH lists (should be in one day only)');
    } else if (!inMar26 && !inMar27) {
      console.log('  ⚠️  ERROR: Not in any list!');
    } else {
      console.log('  ✓ Correct: In only one day list');
    }
  }
  
})().catch(console.error).finally(() => prisma.$disconnect());
