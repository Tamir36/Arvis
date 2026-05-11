import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

const BUSINESS_UTC_OFFSET_MINUTES = 8 * 60;

function businessDayStart(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0) - BUSINESS_UTC_OFFSET_MINUTES * 60 * 1000);
}

function nextBusinessDay(date: Date): Date {
  return new Date(date.getTime() + 24 * 60 * 60 * 1000);
}

function parseDateStart(value: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const [y, m, d] = value.split("-").map(Number);
  return businessDayStart(y, m, d);
}

function businessTodayStart(date = new Date()): Date {
  const shifted = new Date(date.getTime() + BUSINESS_UTC_OFFSET_MINUTES * 60 * 1000);
  return businessDayStart(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate());
}

export async function GET(request: Request) {
  const session = await auth();
  const role = String(session?.user?.role ?? "").toUpperCase();

  if (!session || role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const dateParam = searchParams.get("date");
  let fromDateValue = parseDateStart(searchParams.get("fromDate") ?? dateParam);
  let toDateValue = parseDateStart(searchParams.get("toDate") ?? dateParam);

  if (!fromDateValue && !toDateValue) {
    const today = businessTodayStart();
    fromDateValue = today;
    toDateValue = today;
  } else if (!fromDateValue && toDateValue) {
    fromDateValue = toDateValue;
  } else if (fromDateValue && !toDateValue) {
    toDateValue = fromDateValue;
  }

  if (!fromDateValue || !toDateValue) {
    return NextResponse.json({ error: "Огноо буруу байна" }, { status: 400 });
  }

  if (fromDateValue > toDateValue) {
    const temp = fromDateValue;
    fromDateValue = toDateValue;
    toDateValue = temp;
  }

  const dayStart = fromDateValue;
  const dayEnd = new Date(nextBusinessDay(toDateValue).getTime() - 1);

  const logs = await prisma.orderAuditLog.findMany({
    where: {
      action: { in: ["ADDRESS_CHANGED", "NOTES_CHANGED", "NOTE_ADDED", "STATUS_CHANGED", "DRIVER_CHANGED"] },
      createdAt: { gte: dayStart, lte: dayEnd },
      user: { role: "OPERATOR" },
      NOT: [{ newValue: null }, { newValue: "" }],
    },
    select: {
      orderId: true,
      action: true,
      oldValue: true,
      newValue: true,
      createdAt: true,
      user: { select: { id: true, name: true } },
      order: {
        select: {
          orderNumber: true,
          customer: { select: { phone: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const grouped = new Map<
    string,
    {
      operatorId: string;
      operatorName: string;
      entries: {
        orderId: string;
        orderNumber: string;
        customerPhone: string;
        action: string;
        oldValue: string;
        value: string;
        createdAt: Date;
      }[];
    }
  >();

  for (const log of logs) {
    const key = log.user.id;
    if (!grouped.has(key)) {
      grouped.set(key, {
        operatorId: log.user.id,
        operatorName: log.user.name,
        entries: [],
      });
    }

    grouped.get(key)!.entries.push({
      orderId: log.orderId,
      orderNumber: log.order.orderNumber,
      customerPhone: log.order.customer.phone,
      action: log.action,
      oldValue: String(log.oldValue ?? "").trim(),
      value: String(log.newValue ?? "").trim(),
      createdAt: log.createdAt,
    });
  }

  const result = Array.from(grouped.values())
    .map((group) => ({
      operatorId: group.operatorId,
      operatorName: group.operatorName,
      totalEntries: group.entries.length,
      entries: group.entries,
    }))
    .sort((a, b) => a.operatorName.localeCompare(b.operatorName));

  return NextResponse.json({
    data: result,
    fromDate: dayStart.toISOString(),
    toDate: dayEnd.toISOString(),
  });
}
