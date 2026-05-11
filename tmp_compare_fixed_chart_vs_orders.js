const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const BUSINESS_UTC_OFFSET_MINUTES = 8 * 60;
const CARRYOVER_STATUSES = new Set(['BLANK', 'PENDING', 'CONFIRMED', 'RETURNED']);
const HISTORICAL_EXCLUDED_CARRYOVER_STATUSES_DASHBOARD = ['BLANK', 'PENDING', 'CONFIRMED'];
const ROLLOVER_STATUSES = ['BLANK', 'PENDING', 'CONFIRMED', 'PACKED', 'SHIPPED', 'RETURNED'];
const HISTORICAL_EXCLUDED_CARRYOVER_STATUSES_ORDERS = ['BLANK', 'PENDING', 'CONFIRMED', 'PACKED', 'SHIPPED'];

function businessDayStart(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0) - BUSINESS_UTC_OFFSET_MINUTES * 60 * 1000);
}
function nextBusinessDay(date) { return new Date(date.getTime() + 24 * 60 * 60 * 1000); }
function businessTodayStart(date = new Date()) {
  const shifted = new Date(date.getTime() + BUSINESS_UTC_OFFSET_MINUTES * 60 * 1000);
  return businessDayStart(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate());
}
function filterOrderIdsByDate(rows, dayStart, dayEnd) {
  return rows.filter((row) => row.changedAt && row.changedAt >= dayStart && row.changedAt <= dayEnd).map((row) => row.orderId);
}

function buildDashboardWhere({ dayStart, dayEnd, todayStart, deliveredOrderIds, cancelledOrderIds, returnedOrderIds }) {
  const includesToday = dayStart.getTime() === todayStart.getTime();
  const dateRange = { gte: dayStart, lte: dayEnd };
  const deliveredInRangeFilter = { OR:[ { AND:[ { status:'DELIVERED' }, { id:{ in: deliveredOrderIds } } ] }, { AND:[ { status:'DELIVERED' }, { auditLogs:{ none:{ action:'STATUS_CHANGED', newValue:'DELIVERED' } } }, { updatedAt: dateRange } ] } ] };
  const cancelledInRangeFilter = { OR:[ { AND:[ { status:'CANCELLED' }, { id:{ in: cancelledOrderIds } } ] }, { AND:[ { status:'CANCELLED' }, { auditLogs:{ none:{ action:'STATUS_CHANGED', newValue:'CANCELLED' } } }, { updatedAt: dateRange } ] } ] };
  const returnedInRangeFilter = { OR:[ { AND:[ { status:'RETURNED' }, { id:{ in: returnedOrderIds } } ] }, { AND:[ { status:'RETURNED' }, { delivery:{ is:{ timeSlot:{ is:{ date: dateRange } } } } } ] }, { AND:[ { status:'RETURNED' }, { auditLogs:{ none:{ action:'STATUS_CHANGED', newValue:'RETURNED' } } }, { updatedAt: dateRange } ] } ] };
  const nonTerminalStatusFilter = { status:{ notIn:['DELIVERED','CANCELLED','RETURNED'] } };
  const dateOrFilters = [
    deliveredInRangeFilter,
    cancelledInRangeFilter,
    returnedInRangeFilter,
    { ...nonTerminalStatusFilter, delivery:{ is:{ timeSlot:{ is:{ date: dateRange } } } } },
    { AND:[ { OR:[ { delivery:{ is:null } }, { delivery:{ is:{ timeSlotId:null } } } ] }, nonTerminalStatusFilter, { createdAt: dateRange } ] },
  ];
  if (includesToday) {
    dateOrFilters.push({ AND:[ { status:{ in:Array.from(CARRYOVER_STATUSES) } }, { createdAt:{ lt: todayStart } }, { OR:[ { delivery:{ is:null } }, { delivery:{ is:{ timeSlotId:null } } }, { delivery:{ is:{ timeSlot:{ is:{ date:{ lt: todayStart } } } } } } ] } ] });
  }
  const andFilters = [{ OR: dateOrFilters }];
  if (!includesToday) {
    andFilters.push({ status:{ notIn:[...HISTORICAL_EXCLUDED_CARRYOVER_STATUSES_DASHBOARD] } });
  }
  return { AND: andFilters };
}

function buildOrdersWhere({ dayStart, dayEnd, todayStart, deliveredOrderIds, cancelledOrderIds, returnedOrderIds, statuses }) {
  const dateRange = { gte: dayStart, lte: dayEnd };
  const includesToday = (!dateRange.gte || dateRange.gte < nextBusinessDay(todayStart)) && (!dateRange.lte || dateRange.lte >= todayStart);
  const requestedStatuses = statuses;
  const requestedStatusSet = new Set(requestedStatuses);
  const hasStatusFilter = requestedStatuses.length > 0;
  const deliveredInRangeFilter = { OR:[ { AND:[ { status:'DELIVERED' }, { id:{ in: deliveredOrderIds } } ] }, { AND:[ { status:'DELIVERED' }, { auditLogs:{ none:{ action:'STATUS_CHANGED', newValue:'DELIVERED' } } }, { updatedAt: dateRange } ] } ] };
  const cancelledInRangeFilter = { OR:[ { AND:[ { status:'CANCELLED' }, { id:{ in: cancelledOrderIds } } ] }, { AND:[ { status:'CANCELLED' }, { auditLogs:{ none:{ action:'STATUS_CHANGED', newValue:'CANCELLED' } } }, { updatedAt: dateRange } ] } ] };
  const returnedInRangeFilter = { OR:[ { AND:[ { status:'RETURNED' }, { id:{ in: returnedOrderIds } } ] }, { AND:[ { status:'RETURNED' }, { delivery:{ is:{ timeSlot:{ is:{ date: dateRange } } } } } ] }, { AND:[ { status:'RETURNED' }, { auditLogs:{ none:{ action:'STATUS_CHANGED', newValue:'RETURNED' } } }, { updatedAt: dateRange } ] } ] };
  const includeDelivered = !hasStatusFilter || requestedStatusSet.has('DELIVERED');
  const includeCancelled = !hasStatusFilter || requestedStatusSet.has('CANCELLED');
  const includeReturned = !hasStatusFilter || requestedStatusSet.has('RETURNED');
  const nonTerminalStatuses = hasStatusFilter ? requestedStatuses.filter((status) => !['DELIVERED', 'CANCELLED', 'RETURNED'].includes(status)) : [];
  const dateOrFilters = [];
  if (includeDelivered) dateOrFilters.push(deliveredInRangeFilter);
  if (includeCancelled) dateOrFilters.push(cancelledInRangeFilter);
  if (includeReturned) dateOrFilters.push(returnedInRangeFilter);
  if (!hasStatusFilter || nonTerminalStatuses.length > 0) {
    const nonTerminalStatusFilter = nonTerminalStatuses.length > 0 ? { status:{ in: nonTerminalStatuses } } : { status:{ notIn:['DELIVERED','CANCELLED','RETURNED'] } };
    dateOrFilters.push({ ...nonTerminalStatusFilter, delivery:{ is:{ timeSlot:{ is:{ date: dateRange } } } } });
    dateOrFilters.push({ AND:[ { OR:[ { delivery:{ is:null } }, { delivery:{ is:{ timeSlotId:null } } } ] }, nonTerminalStatusFilter, { createdAt: dateRange } ] });
  }
  if (includesToday) {
    const todayCarryoverStatuses = hasStatusFilter ? requestedStatuses.filter((status) => ROLLOVER_STATUSES.includes(status)) : [...ROLLOVER_STATUSES];
    if (todayCarryoverStatuses.length > 0) {
      dateOrFilters.push({ AND:[ { status:{ in: todayCarryoverStatuses } }, { createdAt:{ lt: todayStart } }, { OR:[ { delivery:{ is:null } }, { delivery:{ is:{ timeSlotId:null } } }, { delivery:{ is:{ timeSlot:{ is:{ date:{ lt: todayStart } } } } } } ] } ] });
    }
  }
  const andFilters = [{ OR: dateOrFilters }];
  if (!includesToday) {
    const noTodayStatuses = requestedStatuses.filter((status) => !HISTORICAL_EXCLUDED_CARRYOVER_STATUSES_ORDERS.includes(status));
    if (noTodayStatuses.length > 0) andFilters.push({ status:{ in:noTodayStatuses } });
    else andFilters.push({ id:{ in:[] } });
  }
  if (hasStatusFilter) andFilters.push({ status:{ in: requestedStatuses } });
  return { AND: andFilters };
}

async function main() {
  const year = 2026;
  const month = 4;
  const todayStart = businessTodayStart(new Date('2026-04-14T12:00:00+08:00'));
  const monthStart = businessDayStart(year, month, 1);
  const monthEnd = new Date(nextBusinessDay(businessDayStart(year, month, 30)).getTime() - 1);
  const statusChangeLogs = await prisma.orderAuditLog.findMany({
    where: { action:'STATUS_CHANGED', newValue:{ in:['DELIVERED','CANCELLED','RETURNED'] }, createdAt:{ gte:monthStart, lte:monthEnd } },
    select: { orderId:true, newValue:true, createdAt:true },
    orderBy: { createdAt:'desc' },
  });
  const deliveredLatestLogs = statusChangeLogs.filter((log) => log.newValue === 'DELIVERED').map((log) => ({ orderId: log.orderId, changedAt: log.createdAt }));
  const cancelledLatestLogs = statusChangeLogs.filter((log) => log.newValue === 'CANCELLED').map((log) => ({ orderId: log.orderId, changedAt: log.createdAt }));
  const returnedLatestLogs = statusChangeLogs.filter((log) => log.newValue === 'RETURNED').map((log) => ({ orderId: log.orderId, changedAt: log.createdAt }));

  for (let day = 6; day <= 13; day += 1) {
    const dayStart = businessDayStart(year, month, day);
    const dayEnd = new Date(nextBusinessDay(dayStart).getTime() - 1);
    const deliveredIds = filterOrderIdsByDate(deliveredLatestLogs, dayStart, dayEnd);
    const cancelledIds = filterOrderIdsByDate(cancelledLatestLogs, dayStart, dayEnd);
    const returnedIds = filterOrderIdsByDate(returnedLatestLogs, dayStart, dayEnd);

    const chartRows = await prisma.order.findMany({ where: buildDashboardWhere({ dayStart, dayEnd, todayStart, deliveredOrderIds: deliveredIds, cancelledOrderIds: cancelledIds, returnedOrderIds: returnedIds }), select: { status: true } });
    const chartCounts = chartRows.reduce((acc, row) => { acc[row.status] = (acc[row.status] || 0) + 1; return acc; }, {});

    const delivered = await prisma.order.count({ where: buildOrdersWhere({ dayStart, dayEnd, todayStart, deliveredOrderIds: deliveredIds, cancelledOrderIds: cancelledIds, returnedOrderIds: returnedIds, statuses: ['DELIVERED'] }) });
    const cancelled = await prisma.order.count({ where: buildOrdersWhere({ dayStart, dayEnd, todayStart, deliveredOrderIds: deliveredIds, cancelledOrderIds: cancelledIds, returnedOrderIds: returnedIds, statuses: ['CANCELLED'] }) });
    const returned = await prisma.order.count({ where: buildOrdersWhere({ dayStart, dayEnd, todayStart, deliveredOrderIds: deliveredIds, cancelledOrderIds: cancelledIds, returnedOrderIds: returnedIds, statuses: ['RETURNED'] }) });

    console.log(`2026-04-${String(day).padStart(2, '0')}`, { chart: chartCounts, orders: { delivered, cancelled, returned } });
  }
}

main().then(()=>process.exit(0)).catch((e)=>{ console.error(e); process.exit(1); });
