import type { PrismaClient } from "@prisma/client";

type SupportedStatus = "DELIVERED" | "CANCELLED" | "RETURNED";

type AuditDb = Pick<PrismaClient, "orderAuditLog">;

export type LatestStatusChangeRow = {
  orderId: string;
  changedAt: Date | null;
};

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

  const rows = await db.orderAuditLog.groupBy({
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

  return rows.map((row) => ({
    orderId: row.orderId,
    changedAt: row._max.createdAt,
  }));
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
  const latestRows = await getLatestStatusChangesByOrder(db, status, options);

  return latestRows
    .filter((row) => {
      const ts = row.changedAt;
      if (!ts) return false;
      if (range.gte && ts < range.gte) return false;
      if (range.lte && ts > range.lte) return false;
      return true;
    })
    .map((row) => row.orderId);
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

  const logs = await db.orderAuditLog.findMany({
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