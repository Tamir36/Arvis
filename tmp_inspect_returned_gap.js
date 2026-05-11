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
  const nonTerminalStatusFilter = { status:{ notIn:['DELIVERED','CANCELLED'] } };
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
  if (!includesToday) andFilters.push({ status:{ notIn:[...HISTORICAL_EXCLUDED_CARRYOVER_STATUSES_DASHBOARD] } });
  return { AND: andFilters };
}

function buildOrdersWhere({ dayStart, dayEnd, todayStart, deliveredOrderIds, cancelledOrderIds, returnedOrderIds }) {
  const dateRange = { gte: dayStart, lte: dayEnd };
  const requestedStatuses = ['RETURNED'];
  const includesToday = (!dateRange.gte || dateRange.gte < nextBusinessDay(todayStart)) && (!dateRange.lte || dateRange.lte >= todayStart);
  const returnedInRangeFilter = { OR:[ { AND:[ { status:'RETURNED' }, { id:{ in: returnedOrderIds } } ] }, { AND:[ { status:'RETURNED' }, { delivery:{ is:{ timeSlot:{ is:{ date: dateRange } } } } } ] }, { AND:[ { status:'RETURNED' }, { auditLogs:{ none:{ action:'STATUS_CHANGED', newValue:'RETURNED' } } }, { updatedAt: dateRange } ] } ] };
  const dateOrFilters = [returnedInRangeFilter];
  if (includesToday) {
    const todayCarryoverStatuses = requestedStatuses.filter((status) => ROLLOVER_STATUSES.includes(status));
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
  andFilters.push({ status:{ in: requestedStatuses } });
  return { AND: andFilters };
}

async function inspect(day) {
  const year = 2026, month = 4;
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
  const dayStart = businessDayStart(year, month, day);
  const dayEnd = new Date(nextBusinessDay(dayStart).getTime() - 1);
  const deliveredIds = filterOrderIdsByDate(deliveredLatestLogs, dayStart, dayEnd);
  const cancelledIds = filterOrderIdsByDate(cancelledLatestLogs, dayStart, dayEnd);
  const returnedIds = filterOrderIdsByDate(returnedLatestLogs, dayStart, dayEnd);

  const chartRows = await prisma.order.findMany({
    where: buildDashboardWhere({ dayStart, dayEnd, todayStart, deliveredOrderIds: deliveredIds, cancelledOrderIds: cancelledIds, returnedOrderIds: returnedIds }),
    select: { id:true, orderNumber:true, status:true, createdAt:true, updatedAt:true, delivery:{ select:{ timeSlot:{ select:{ date:true } } } } },
  });
  const ordersRows = await prisma.order.findMany({
    where: buildOrdersWhere({ dayStart, dayEnd, todayStart, deliveredOrderIds: deliveredIds, cancelledOrderIds: cancelledIds, returnedOrderIds: returnedIds }),
    select: { id:true, orderNumber:true, status:true, createdAt:true, updatedAt:true, delivery:{ select:{ timeSlot:{ select:{ date:true } } } } },
  });
  const chartReturned = chartRows.filter((row) => row.status === 'RETURNED');
  console.log(`DAY ${day}`);
  console.log('chart returned:', chartReturned.map((row) => ({ orderNumber: row.orderNumber, slot: row.delivery?.timeSlot?.date?.toISOString?.() ?? null, updatedAt: row.updatedAt.toISOString() })));
  console.log('orders returned:', ordersRows.map((row) => ({ orderNumber: row.orderNumber, slot: row.delivery?.timeSlot?.date?.toISOString?.() ?? null, updatedAt: row.updatedAt.toISOString() })));
}

(async()=>{ await inspect(10); await inspect(12); })().then(()=>process.exit(0)).catch((e)=>{ console.error(e); process.exit(1); });
