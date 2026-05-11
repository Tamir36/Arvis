const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const ROLLOVER_STATUSES = ['BLANK', 'PENDING', 'CONFIRMED', 'PACKED', 'SHIPPED', 'RETURNED'];
const HISTORICAL_EXCLUDED_CARRYOVER_STATUSES = ['BLANK', 'PENDING', 'CONFIRMED', 'PACKED', 'SHIPPED'];
const BUSINESS_UTC_OFFSET_MINUTES = 8 * 60;

function startOfDay(date) {
  const shifted = new Date(date.getTime() + BUSINESS_UTC_OFFSET_MINUTES * 60 * 1000);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate(), 0, 0, 0, 0) - BUSINESS_UTC_OFFSET_MINUTES * 60 * 1000);
}
function nextDay(date) { return new Date(date.getTime() + 24 * 60 * 60 * 1000); }
function parseDateStart(value) {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0) - BUSINESS_UTC_OFFSET_MINUTES * 60 * 1000);
}
function toDayEnd(dayStart) { return new Date(nextDay(dayStart).getTime() - 1); }

async function countForDay(statuses, dateStr) {
  const requestedStatuses = statuses;
  const hasStatusFilter = requestedStatuses.length > 0;
  const requestedStatusSet = new Set(requestedStatuses);
  const where = {};
  const andFilters = [];
  const dateRange = { gte: parseDateStart(dateStr), lte: toDayEnd(parseDateStart(dateStr)) };
  const todayStart = startOfDay(new Date('2026-04-14T12:00:00+08:00'));
  const todayEnd = nextDay(todayStart);
  const includesToday = (!dateRange.gte || dateRange.gte < todayEnd) && (!dateRange.lte || dateRange.lte >= todayStart);

  const [deliveredLatestLogs, cancelledLatestLogs, returnedLatestLogs] = await Promise.all([
    prisma.orderAuditLog.groupBy({ by:['orderId'], where:{ action:'STATUS_CHANGED', newValue:'DELIVERED' }, _max:{ createdAt:true } }),
    prisma.orderAuditLog.groupBy({ by:['orderId'], where:{ action:'STATUS_CHANGED', newValue:'CANCELLED' }, _max:{ createdAt:true } }),
    prisma.orderAuditLog.groupBy({ by:['orderId'], where:{ action:'STATUS_CHANGED', newValue:'RETURNED' }, _max:{ createdAt:true } }),
  ]);

  const deliveredOrderIds = deliveredLatestLogs.filter((row)=> row._max.createdAt && row._max.createdAt >= dateRange.gte && row._max.createdAt <= dateRange.lte).map((row)=> row.orderId);
  const cancelledOrderIds = cancelledLatestLogs.filter((row)=> row._max.createdAt && row._max.createdAt >= dateRange.gte && row._max.createdAt <= dateRange.lte).map((row)=> row.orderId);
  const returnedOrderIds = returnedLatestLogs.filter((row)=> row._max.createdAt && row._max.createdAt >= dateRange.gte && row._max.createdAt <= dateRange.lte).map((row)=> row.orderId);

  const deliveredInRangeFilter = { OR:[ { AND:[ { status:'DELIVERED' }, { id:{ in: deliveredOrderIds } } ] }, { AND:[ { status:'DELIVERED' }, { auditLogs:{ none:{ action:'STATUS_CHANGED', newValue:'DELIVERED' } } }, { updatedAt: dateRange } ] } ] };
  const cancelledInRangeFilter = { OR:[ { AND:[ { status:'CANCELLED' }, { id:{ in: cancelledOrderIds } } ] }, { AND:[ { status:'CANCELLED' }, { auditLogs:{ none:{ action:'STATUS_CHANGED', newValue:'CANCELLED' } } }, { updatedAt: dateRange } ] } ] };
  const returnedInRangeFilter = { OR:[ { AND:[ { status:'RETURNED' }, { id:{ in: returnedOrderIds } } ] }, { AND:[ { status:'RETURNED' }, { delivery:{ is:{ timeSlot:{ is:{ date: dateRange } } } } } ] }, { AND:[ { status:'RETURNED' }, { auditLogs:{ none:{ action:'STATUS_CHANGED', newValue:'RETURNED' } } }, { updatedAt: dateRange } ] } ] };

  const includeDelivered = !hasStatusFilter || requestedStatusSet.has('DELIVERED');
  const includeCancelled = !hasStatusFilter || requestedStatusSet.has('CANCELLED');
  const includeReturned = !hasStatusFilter || requestedStatusSet.has('RETURNED');
  const nonTerminalStatuses = hasStatusFilter ? requestedStatuses.filter((status) => !['DELIVERED','CANCELLED','RETURNED'].includes(status)) : [];
  const dateOrFilters = [];
  if (includeDelivered) dateOrFilters.push(deliveredInRangeFilter);
  if (includeCancelled) dateOrFilters.push(cancelledInRangeFilter);
  if (includeReturned) dateOrFilters.push(returnedInRangeFilter);
  if (!hasStatusFilter || nonTerminalStatuses.length > 0) {
    const nonTerminalStatusFilter = nonTerminalStatuses.length > 0 ? { status:{ in: nonTerminalStatuses } } : { status:{ notIn:['DELIVERED','CANCELLED'] } };
    dateOrFilters.push({ ...nonTerminalStatusFilter, delivery:{ is:{ timeSlot:{ is:{ date: dateRange } } } } });
    dateOrFilters.push({ AND:[ { OR:[ { delivery:{ is:null } }, { delivery:{ is:{ timeSlotId:null } } } ] }, nonTerminalStatusFilter, { createdAt: dateRange } ] });
  }
  if (includesToday) {
    const todayCarryoverStatuses = hasStatusFilter ? requestedStatuses.filter((status) => ROLLOVER_STATUSES.includes(status)) : [...ROLLOVER_STATUSES];
    if (todayCarryoverStatuses.length > 0) {
      dateOrFilters.push({ AND:[ { status:{ in: todayCarryoverStatuses } }, { createdAt:{ lt: todayStart } }, { OR:[ { delivery:{ is:null } }, { delivery:{ is:{ timeSlotId:null } } }, { delivery:{ is:{ timeSlot:{ is:{ date:{ lt: todayStart } } } } } } ] } ] });
    }
  }
  andFilters.push({ OR: dateOrFilters });
  if (!includesToday) {
    if (hasStatusFilter) {
      const noTodayStatuses = requestedStatuses.filter((status) => !HISTORICAL_EXCLUDED_CARRYOVER_STATUSES.includes(status));
      if (noTodayStatuses.length > 0) andFilters.push({ status:{ in: noTodayStatuses } });
      else andFilters.push({ id:{ in: [] } });
    } else {
      andFilters.push({ status:{ notIn:[...HISTORICAL_EXCLUDED_CARRYOVER_STATUSES] } });
    }
  }
  if (hasStatusFilter) andFilters.push({ status:{ in: requestedStatuses } });
  where.AND = andFilters;
  return prisma.order.count({ where });
}

async function main() {
  for (let day = 6; day <= 13; day += 1) {
    const dateStr = `2026-04-${String(day).padStart(2, '0')}`;
    const delivered = await countForDay(['DELIVERED'], dateStr);
    const cancelled = await countForDay(['CANCELLED'], dateStr);
    const returned = await countForDay(['RETURNED'], dateStr);
    console.log(dateStr, { delivered, cancelled, returned });
  }
}

main().then(()=>process.exit(0)).catch((e)=>{ console.error(e); process.exit(1); });
