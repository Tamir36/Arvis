const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const BUSINESS_UTC_OFFSET_MINUTES = 8 * 60;
const CARRYOVER_STATUSES = new Set(['BLANK', 'PENDING', 'CONFIRMED', 'RETURNED']);

function businessDayStart(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0) - BUSINESS_UTC_OFFSET_MINUTES * 60 * 1000);
}
function nextBusinessDay(date) {
  return new Date(date.getTime() + 24 * 60 * 60 * 1000);
}
function businessTodayStart(date = new Date()) {
  const shifted = new Date(date.getTime() + BUSINESS_UTC_OFFSET_MINUTES * 60 * 1000);
  return businessDayStart(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate());
}
function filterOrderIdsByDate(rows, dayStart, dayEnd) {
  return rows.filter((row) => row.changedAt && row.changedAt >= dayStart && row.changedAt <= dayEnd).map((row) => row.orderId);
}
function buildDailyStatusWhere({ dayStart, dayEnd, todayStart, deliveredOrderIds, cancelledOrderIds, returnedOrderIds }) {
  const includesToday = dayStart.getTime() === todayStart.getTime();
  const dateRange = { gte: dayStart, lte: dayEnd };

  const deliveredInRangeFilter = {
    OR: [
      { AND: [{ status: 'DELIVERED' }, { id: { in: deliveredOrderIds } }] },
      {
        AND: [
          { status: 'DELIVERED' },
          { auditLogs: { none: { action: 'STATUS_CHANGED', newValue: 'DELIVERED' } } },
          { updatedAt: dateRange },
        ],
      },
    ],
  };

  const cancelledInRangeFilter = {
    OR: [
      { AND: [{ status: 'CANCELLED' }, { id: { in: cancelledOrderIds } }] },
      {
        AND: [
          { status: 'CANCELLED' },
          { auditLogs: { none: { action: 'STATUS_CHANGED', newValue: 'CANCELLED' } } },
          { updatedAt: dateRange },
        ],
      },
    ],
  };

  const returnedInRangeFilter = {
    OR: [
      { AND: [{ status: 'RETURNED' }, { id: { in: returnedOrderIds } }] },
      {
        AND: [
          { status: 'RETURNED' },
          { delivery: { is: { timeSlot: { is: { date: dateRange } } } } },
        ],
      },
      {
        AND: [
          { status: 'RETURNED' },
          { auditLogs: { none: { action: 'STATUS_CHANGED', newValue: 'RETURNED' } } },
          { updatedAt: dateRange },
        ],
      },
    ],
  };

  const nonTerminalStatusFilter = {
    status: { notIn: ['DELIVERED', 'CANCELLED'] },
  };

  const dateOrFilters = [
    deliveredInRangeFilter,
    cancelledInRangeFilter,
    returnedInRangeFilter,
    {
      ...nonTerminalStatusFilter,
      delivery: { is: { timeSlot: { is: { date: dateRange } } } },
    },
    {
      AND: [
        { OR: [{ delivery: { is: null } }, { delivery: { is: { timeSlotId: null } } }] },
        nonTerminalStatusFilter,
        { createdAt: dateRange },
      ],
    },
  ];

  if (includesToday) {
    dateOrFilters.push({
      AND: [
        { status: { in: Array.from(CARRYOVER_STATUSES) } },
        { createdAt: { lt: todayStart } },
        {
          OR: [
            { delivery: { is: null } },
            { delivery: { is: { timeSlotId: null } } },
            { delivery: { is: { timeSlot: { is: { date: { lt: todayStart } } } } } },
          ],
        },
      ],
    });
  }

  const andFilters = [{ OR: dateOrFilters }];
  if (!includesToday) {
    andFilters.push({ status: { notIn: Array.from(CARRYOVER_STATUSES) } });
  }
  return { AND: andFilters };
}

async function main() {
  const year = 2026;
  const month = 4;
  const todayStart = businessTodayStart(new Date('2026-04-14T12:00:00+08:00'));
  const monthStart = businessDayStart(year, month, 1);
  const monthEnd = new Date(nextBusinessDay(businessDayStart(year, month, 30)).getTime() - 1);

  const statusChangeLogs = await prisma.orderAuditLog.findMany({
    where: {
      action: 'STATUS_CHANGED',
      newValue: { in: ['DELIVERED', 'CANCELLED', 'RETURNED'] },
      createdAt: { gte: monthStart, lte: monthEnd },
    },
    select: { orderId: true, newValue: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });

  const deliveredLatestLogs = statusChangeLogs.filter((log) => log.newValue === 'DELIVERED').map((log) => ({ orderId: log.orderId, changedAt: log.createdAt }));
  const cancelledLatestLogs = statusChangeLogs.filter((log) => log.newValue === 'CANCELLED').map((log) => ({ orderId: log.orderId, changedAt: log.createdAt }));
  const returnedLatestLogs = statusChangeLogs.filter((log) => log.newValue === 'RETURNED').map((log) => ({ orderId: log.orderId, changedAt: log.createdAt }));

  for (let day = 5; day <= 13; day += 1) {
    const dayStart = businessDayStart(year, month, day);
    const dayEnd = new Date(nextBusinessDay(dayStart).getTime() - 1);
    const where = buildDailyStatusWhere({
      dayStart,
      dayEnd,
      todayStart,
      deliveredOrderIds: filterOrderIdsByDate(deliveredLatestLogs, dayStart, dayEnd),
      cancelledOrderIds: filterOrderIdsByDate(cancelledLatestLogs, dayStart, dayEnd),
      returnedOrderIds: filterOrderIdsByDate(returnedLatestLogs, dayStart, dayEnd),
    });

    const rows = await prisma.order.findMany({ where, select: { id: true, status: true, orderNumber: true } });
    const counts = rows.reduce((acc, row) => {
      acc[row.status] = (acc[row.status] || 0) + 1;
      return acc;
    }, {});

    const directDelivered = filterOrderIdsByDate(deliveredLatestLogs, dayStart, dayEnd).length;
    const directCancelled = filterOrderIdsByDate(cancelledLatestLogs, dayStart, dayEnd).length;
    const directReturned = filterOrderIdsByDate(returnedLatestLogs, dayStart, dayEnd).length;

    console.log(`\n2026-04-${String(day).padStart(2, '0')}`);
    console.log('dashboard query counts:', JSON.stringify(counts));
    console.log('direct status-change counts:', JSON.stringify({ DELIVERED: directDelivered, CANCELLED: directCancelled, RETURNED: directReturned }));
  }
}

main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
