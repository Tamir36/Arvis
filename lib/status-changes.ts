import type { PrismaClient } from "@prisma/client";

type SupportedStatus = "DELIVERED" | "CANCELLED" | "RETURNED";

type AuditDb = Pick<PrismaClient, "orderAuditLog" | "$queryRawUnsafe">;

export type LatestStatusChangeRow = {
  orderId: string;
  changedAt: Date | null;
};

type AuditLogLikeRow = {
  orderId: string;
  createdAt: Date;
  newValue?: string | null;
};

async function fetchArchiveRowsSafe<T = AuditLogLikeRow[]>(
  db: AuditDb,
  sql: string,
  ...params: unknown[]
): Promise<T> {
  try {
    return await db.$queryRawUnsafe<T>(sql, ...params);
  } catch {
    // Archive table might not exist yet on some environments.
    return [] as T;
  }
}

function cutoffDateDaysAgo(days: number): Date {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return cutoff;
}

export async function getLatestStatusChangesByOrder(
  db: AuditDb,
  status: SupportedStatus,
  options?: {
    orderIds?: string[];
  },
): Promise<LatestStatusChangeRow[]> {
  if (options?.orderIds && options.orderIds.length === 0) {
    return [];
  }

  const activeRows = await db.orderAuditLog.groupBy({
    by: ["orderId"],
    where: {
      action: "STATUS_CHANGED",
      newValue: status,
      ...(options?.orderIds ? { orderId: { in: options.orderIds } } : {}),
    },
    _max: {
      createdAt: true,
    },
  });

  const cutoff = cutoffDateDaysAgo(90);
  const shouldReadArchive = !options?.orderIds || options.orderIds.length > 0;

  const archiveWhereIds = options?.orderIds && options.orderIds.length > 0
    ? ` AND orderId IN (${options.orderIds.map(() => "?").join(",")})`
    : "";

  const archiveRows = shouldReadArchive
    ? await fetchArchiveRowsSafe<Array<{ orderId: string; changedAt: Date | null }>>(
      db,
      `
        SELECT orderId, MAX(createdAt) AS changedAt
        FROM order_audit_logs_archive
        WHERE action = ?
          AND newValue = ?
          AND createdAt < ?
          ${archiveWhereIds}
        GROUP BY orderId
      `,
      "STATUS_CHANGED",
      status,
      cutoff,
      ...(options?.orderIds ?? []),
    )
    : [];

  const merged = new Map<string, Date | null>();

  for (const row of activeRows) {
    merged.set(row.orderId, row._max.createdAt);
  }

  for (const row of archiveRows) {
    const prev = merged.get(row.orderId);
    if (!prev || (row.changedAt && row.changedAt > prev)) {
      merged.set(row.orderId, row.changedAt);
    }
  }

  return Array.from(merged.entries()).map(([orderId, changedAt]) => ({ orderId, changedAt }));
}

export function filterOrderIdsByDate(
  rows: LatestStatusChangeRow[],
  dayStart: Date,
  dayEnd: Date,
): string[] {
  return rows
    .filter((row) => {
      if (!row.changedAt) return false;
      return row.changedAt >= dayStart && row.changedAt <= dayEnd;
    })
    .map((row) => row.orderId);
}

export async function getOrderIdsWithLatestStatusInRange(
  db: AuditDb,
  status: SupportedStatus,
  range: {
    gte?: Date;
    lte?: Date;
  },
  options?: {
    orderIds?: string[];
  },
): Promise<string[]> {
  if (options?.orderIds && options.orderIds.length === 0) {
    return [];
  }

  const activeRows = await db.orderAuditLog.findMany({
    where: {
      action: "STATUS_CHANGED",
      newValue: status,
      createdAt: {
        gte: range.gte,
        lte: range.lte,
      },
      ...(options?.orderIds ? { orderId: { in: options.orderIds } } : {}),
    },
    distinct: ["orderId"],
    select: {
      orderId: true,
    },
  });

  const activeOrderIds = activeRows.map((row) => row.orderId);

  // We archive logs older than 90 days; include archive only when query range can touch old data.
  const cutoff = cutoffDateDaysAgo(90);
  const shouldReadArchive = !range.gte || range.gte < cutoff;

  if (!shouldReadArchive) {
    return activeOrderIds;
  }

  const archiveWhereIds = options?.orderIds && options.orderIds.length > 0
    ? ` AND orderId IN (${options.orderIds.map(() => "?").join(",")})`
    : "";

  const archiveRows = await fetchArchiveRowsSafe<Array<{ orderId: string }>>(
    db,
    `
      SELECT DISTINCT orderId
      FROM order_audit_logs_archive
      WHERE action = ?
        AND newValue = ?
        AND createdAt >= ?
        AND createdAt <= ?
        ${archiveWhereIds}
    `,
    "STATUS_CHANGED",
    status,
    range.gte ?? new Date("1970-01-01T00:00:00.000Z"),
    range.lte ?? new Date("2999-12-31T23:59:59.999Z"),
    ...(options?.orderIds ?? []),
  );

  return Array.from(new Set([...activeOrderIds, ...archiveRows.map((row) => row.orderId)]));
}

export async function getLatestStatusChangedAtByOrderStatus(
  db: AuditDb,
  params: {
    orderIds: string[];
    statuses: SupportedStatus[];
  },
): Promise<Map<string, Date>> {
  if (params.orderIds.length === 0 || params.statuses.length === 0) {
    return new Map();
  }

  const activeLogs = await db.orderAuditLog.findMany({
    where: {
      action: "STATUS_CHANGED",
      newValue: { in: params.statuses },
      orderId: { in: params.orderIds },
    },
    select: {
      orderId: true,
      newValue: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const statusPlaceholders = params.statuses.map(() => "?").join(",");
  const orderIdPlaceholders = params.orderIds.map(() => "?").join(",");
  const archiveLogs = await fetchArchiveRowsSafe<AuditLogLikeRow[]>(
    db,
    `
      SELECT orderId, newValue, createdAt
      FROM order_audit_logs_archive
      WHERE action = ?
        AND newValue IN (${statusPlaceholders})
        AND orderId IN (${orderIdPlaceholders})
      ORDER BY createdAt DESC
    `,
    "STATUS_CHANGED",
    ...params.statuses,
    ...params.orderIds,
  );

  const logs = [...activeLogs, ...archiveLogs].sort((a, b) => +b.createdAt - +a.createdAt);

  const latestByOrderStatus = new Map<string, Date>();
  for (const log of logs) {
    const status = String(log.newValue ?? "").toUpperCase() as SupportedStatus;
    const key = `${log.orderId}:${status}`;
    if (!latestByOrderStatus.has(key)) {
      latestByOrderStatus.set(key, log.createdAt);
    }
  }

  return latestByOrderStatus;
}