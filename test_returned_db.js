const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function startOfDay(date) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function nextDay(date) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

(async () => {
  const orderId = 'cmn61gozg004nhibf9v17twya';
  
  console.log('=== STEP 1: UPDATE ORDER STATUS TO RETURNED ===');
  const updated = await prisma.order.update({
    where: { id: orderId },
    data: {
      status: 'RETURNED'
    },
    include: {
      delivery: {
        include: { timeSlot: true }
      }
    }
  });
  
  // Update delivery status separately
  if (updated.delivery) {
    await prisma.deliveryAssignment.update({
      where: { id: updated.delivery.id },
      data: { status: 'RETURNED' }
    });
  }
  
  console.log('Updated status:', updated.status);
  console.log('Updated at:', updated.updatedAt);
  console.log('Delivery status:', updated.delivery.status);
  console.log('Old timeSlot date:', updated.delivery.timeSlot.date);
  
  // Create next day time slot
  console.log('\n=== STEP 2: CREATE NEXT DAY TIME SLOT ===');
  const now = new Date('2026-03-26T14:33:00Z');
  const nextDayDate = nextDay(now);
  
  const slot = await prisma.timeSlot.create({
    data: {
      date: nextDayDate,
      startTime: '09:00',
      endTime: '21:00',
      maxOrders: 100,
      bookedCount: 0,
      isActive: true
    }
  });
  
  console.log('Created slot for:', slot.date);
  
  // Update delivery assignment to new slot
  console.log('\n=== STEP 3: UPDATE DELIVERY TO NEW TIMESLOT ===');
  const updatedDelivery = await prisma.deliveryAssignment.update({
    where: { id: updated.delivery.id },
    data: { timeSlotId: slot.id }
  });
  
  console.log('Updated delivery to slot:', slot.date);
  
  // Create audit log
  console.log('\n=== STEP 4: CREATE AUDIT LOG ===');
  const log = await prisma.orderAuditLog.create({
    data: {
      orderId,
      userId: 'cmn0ergew0002fugm1fckmea7',
      action: 'STATUS_CHANGED',
      oldValue: 'DELIVERED',
      newValue: 'RETURNED'
    }
  });
  
  console.log('Audit log created');
  
  // Now query driver deliveries for 3/26
  console.log('\n=== STEP 5: CHECK 3/26 DRIVER DELIVERIES ===');
  const today = startOfDay(new Date('2026-03-26'));
  const tomorrow = startOfDay(new Date('2026-03-27'));
  
  const mar26Orders = await prisma.order.findMany({
    where: {
      OR: [
        {
          AND: [
            { status: 'PENDING' },
            { delivery: { timeSlot: { date: { gte: today, lt: tomorrow } } } }
          ]
        },
        {
          AND: [
            { status: 'RETURNED' },
            { updatedAt: { gte: today, lt: tomorrow } }
          ]
        }
      ],
      assignedToId: 'cmn0ergew0002fugm1fckmea7'
    },
    include: { delivery: { include: { timeSlot: true } } }
  });
  
  const inList26 = mar26Orders.find(o => o.id === orderId);
  console.log('Order in 3/26 list?', inList26 ? 'YES' : 'NO');
  if (inList26) {
    console.log('  Status:', inList26.status);
    console.log('  Updated At:', inList26.updatedAt);
  }
  
  // Query for 3/27
  console.log('\n=== STEP 6: CHECK 3/27 DRIVER DELIVERIES ===');
  const mar27tomorrow = startOfDay(new Date('2026-03-28'));
  const mar27Orders = await prisma.order.findMany({
    where: {
      OR: [
        {
          AND: [
            { status: 'PENDING' },
            { delivery: { timeSlot: { date: { gte: tomorrow, lt: mar27tomorrow } } } }
          ]
        },
        {
          AND: [
            { status: 'RETURNED' },
            { updatedAt: { gte: tomorrow, lt: mar27tomorrow } }
          ]
        }
      ],
      assignedToId: 'cmn0ergew0002fugm1fckmea7'
    },
    include: { delivery: { include: { timeSlot: true } } }
  });
  
  const inList27 = mar27Orders.find(o => o.id === orderId);
  console.log('Order in 3/27 list?', inList27 ? 'YES' : 'NO');
  if (inList27) {
    console.log('  Status:', inList27.status);
    console.log('  TimeSlot Date:', inList27.delivery.timeSlot.date);
  }
  
  // Check admin/operator view (all orders with status)
  console.log('\n=== STEP 7: CHECK ADMIN/OPERATOR VIEW ===');
  const adminView = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      customer: true,
      delivery: { include: { timeSlot: true } }
    }
  });
  
  console.log('Admin view status:', adminView.status);
  console.log('Admin view updated:', adminView.updatedAt);
  console.log('Admin view new slot date:', adminView.delivery?.timeSlot?.date);
  
})().catch(e => console.error('Error:', e)).finally(() => prisma.$disconnect());
