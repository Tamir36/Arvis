const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  // Find the order
  const order = await prisma.order.findFirst({
    where: { customer: { phone: '88166030' } },
    include: { delivery: { include: { timeSlot: true } } }
  });
  
  if (!order) {
    console.log('Order not found');
    return;
  }
  
  console.log('=== CURRENT STATE ===');
  console.log('Order:', order.orderNumber);
  console.log('Status:', order.status);
  console.log('Updated At:', order.updatedAt.toISOString());
  console.log('Current TimeSlot Date:', order.delivery?.timeSlot?.date?.toISOString() || 'None');
  
  if (!order.delivery) {
    console.log('ERROR: No delivery assignment found!');
    return;
  }
  
  // Get current time slot date
  const currentSlotDate = new Date(order.delivery.timeSlot.date);
  const nextDayOnly = new Date(currentSlotDate);
  nextDayOnly.setUTCDate(nextDayOnly.getUTCDate() + 1);
  nextDayOnly.setUTCHours(0, 0, 0, 0);
  
  console.log('\n=== FIXING: Creating 3/27 TimeSlot ===');
  
  // Check if 3/27 slot exists
  const existingSlot = await prisma.timeSlot.findFirst({
    where: {
      date: nextDayOnly
    }
  });
  
  let slotId;
  if (existingSlot) {
    console.log('Using existing 3/27 slot:', existingSlot.id);
    slotId = existingSlot.id;
  } else {
    console.log('Creating new 3/27 slot');
    const newSlot = await prisma.timeSlot.create({
      data: {
        date: nextDayOnly,
        startTime: '09:00',
        endTime: '21:00',
        maxOrders: 100,
        bookedCount: 0,
        isActive: true
      }
    });
    slotId = newSlot.id;
    console.log('Created slot:', slotId);
  }
  
  // Update delivery assignment to point to 3/27 slot
  console.log('\n=== UPDATING DELIVERY ASSIGNMENT ===');
  const updated = await prisma.deliveryAssignment.update({
    where: { id: order.delivery.id },
    data: { timeSlotId: slotId },
    include: { timeSlot: true }
  });
  
  console.log('Updated TimeSlot to:', updated.timeSlot.date.toISOString());
  
  console.log('\n=== VERIFICATION ===');
  const newOrder = await prisma.order.findFirst({
    where: { customer: { phone: '88166030' } },
    include: { delivery: { include: { timeSlot: true } } }
  });
  
  console.log('Order TimeSlot Date (should be 3/27):', newOrder.delivery.timeSlot.date.toISOString().split('T')[0]);
  
})().catch(console.error).finally(() => prisma.$disconnect());
