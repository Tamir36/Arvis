const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  const driverId = 'cmn0ergew0002fugm1fckmea7';
  
  // Replicate EXACTLY what the API does
  const selectedDate = new Date(2026, 2, 27); // 2026-03-27 (new Date uses 0-based months!)
  const dayStart = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), 0, 0, 0, 0);
  const dayEnd = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), 23, 59, 59, 999);
  
  console.log('=== REPLICATING API ROUTE LOGIC FOR 3/27 ===');
  console.log('selectedDate:', selectedDate);
  console.log('dayStart:', dayStart);
  console.log('dayEnd:', dayEnd);
  
  const deliveries = await prisma.order.findMany({
    where: {
      assignedToId: driverId,
      status: { not: "PENDING" },
      OR: [
        {
          delivery: {
            is: {
              timeSlot: {
                is: {
                  date: {
                    gte: dayStart,
                    lte: dayEnd,
                  },
                },
              },
            },
          },
        },
        {
          AND: [
            { status: "RETURNED" },
            { updatedAt: { gte: dayStart, lte: dayEnd } },
          ],
        },
        {
          AND: [
            {
              OR: [
                { delivery: { is: null } },
                { delivery: { is: { timeSlotId: null } } },
              ],
            },
            { updatedAt: { gte: dayStart, lte: dayEnd } },
          ],
        },
      ],
    },
    include: {
      customer: { select: { phone: true, name: true } },
      delivery: { include: { timeSlot: true } },
    },
  });
  
  console.log('\nFound:', deliveries.length, 'orders');
  deliveries.forEach(order => {
    console.log(`  - ${order.orderNumber} (${order.customer.phone}) Status: ${order.status}`);
    console.log(`    TimeSlot: ${order.delivery?.timeSlot?.date?.toISOString() || 'None'}`);
  });
  
})().catch(console.error).finally(() => prisma.$disconnect());
