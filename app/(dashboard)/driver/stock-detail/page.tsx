"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import Header from "@/components/layout/Header";
import { Card } from "@/components/ui/Card";

interface MovementCell {
  day: string;
  added: number;
  removed: number;
  balance: number;
}

interface MovementRow {
  productId: string;
  productName: string;
  values: MovementCell[];
}

function getTodayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function displayDate(isoDate: string): string {
  return isoDate.replace(/-/g, ".");
}

export default function DriverStockDetailPage() {
  const today = useMemo(() => getTodayLocal(), []);
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [isLoading, setIsLoading] = useState(false);
  const [rows, setRows] = useState<MovementRow[]>([]);
  const [days, setDays] = useState<string[]>([]);
  const [expandedMobileDay, setExpandedMobileDay] = useState<string>("");
  const [error, setError] = useState("");

  const fetchMovement = useCallback(async () => {
    setIsLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({ fromDate, toDate });
      const res = await fetch(`/api/stock/driver-movements?${params.toString()}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error ?? "Дэлгэрэнгүй хөдөлгөөний хүснэгт ачаалж чадсангүй");
      }

      setRows(Array.isArray(json.rows) ? json.rows : []);
      setDays(Array.isArray(json.days) ? json.days : []);
    } catch (e) {
      setRows([]);
      setDays([]);
      setError(e instanceof Error ? e.message : "Алдаа гарлаа");
    } finally {
      setIsLoading(false);
    }
  }, [fromDate, toDate]);

  useEffect(() => {
    void fetchMovement();
  }, [fetchMovement]);

  const visibleRows = useMemo(() => {
    // Hide products that are completely zero for the selected date range.
    return rows.filter((row) => row.values.some((cell) => cell.balance > 0));
  }, [rows]);

  const visibleTotalsByDay = useMemo(() => {
    const totals: Record<string, { added: number; removed: number; balance: number }> = {};
    for (const day of days) {
      totals[day] = { added: 0, removed: 0, balance: 0 };
    }

    for (const row of visibleRows) {
      for (const cell of row.values) {
        if (!totals[cell.day]) {
          totals[cell.day] = { added: 0, removed: 0, balance: 0 };
        }
        totals[cell.day].added += cell.added;
        totals[cell.day].removed += cell.removed;
        totals[cell.day].balance += cell.balance;
      }
    }

    return totals;
  }, [days, visibleRows]);

  useEffect(() => {
    if (days.length === 0) {
      setExpandedMobileDay("");
      return;
    }

    if (!expandedMobileDay || !days.includes(expandedMobileDay)) {
      setExpandedMobileDay(days[days.length - 1]);
    }
  }, [days, expandedMobileDay]);

  return (
    <div>
      <Header title="Үлдэгдлийн дэлгэрэнгүй" subtitle="Өдөр, сараар шүүсэн барааны хөдөлгөөний хүснэгт" showSearch={false} />

      <div className="space-y-4 p-3 sm:p-5">
        <Card padding="none">
          <div className="border-b border-slate-200 px-4 py-3">
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-xs text-slate-600">
                Эхлэх огноо
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-slate-600">
                Дуусах огноо
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>
              <button
                type="button"
                onClick={() => void fetchMovement()}
                className="rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
              >
                Шинэчлэх
              </button>
            </div>
          </div>

          <div className="max-h-[calc(100vh-220px)] overflow-auto">
            {isLoading ? (
              <div className="p-10 text-center text-sm text-slate-400">Ачааллаж байна...</div>
            ) : error ? (
              <div className="p-10 text-center text-sm text-red-500">{error}</div>
            ) : rows.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-400">Хөдөлгөөний мэдээлэл алга</div>
            ) : visibleRows.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-400">0 үлдэгдэлтэй бараанууд нуусан байна</div>
            ) : (
              <>
                <div className="space-y-3 p-3 md:hidden">
                  {days.map((day) => (
                    <div key={`mobile-day-${day}`} className="space-y-2">
                      <button
                        type="button"
                        onClick={() => setExpandedMobileDay((current) => (current === day ? "" : day))}
                        className="w-full rounded-xl border border-slate-200 bg-white p-3 text-left"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-xs font-semibold text-slate-700">{displayDate(day)}</div>
                          <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${expandedMobileDay === day ? "rotate-180" : ""}`} />
                        </div>
                        <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                          <div className="rounded-lg bg-emerald-50 px-2 py-2 text-center text-emerald-700">
                            <div className="font-medium">Нэмэгдсэн</div>
                            <div className="mt-1 text-sm font-semibold">{visibleTotalsByDay[day]?.added ?? 0}</div>
                          </div>
                          <div className="rounded-lg bg-red-50 px-2 py-2 text-center text-red-700">
                            <div className="font-medium">Хасагдсан</div>
                            <div className="mt-1 text-sm font-semibold">{visibleTotalsByDay[day]?.removed ?? 0}</div>
                          </div>
                          <div className="rounded-lg bg-slate-100 px-2 py-2 text-center text-slate-700">
                            <div className="font-medium">Үлдэгдэл</div>
                            <div className="mt-1 text-sm font-semibold">{visibleTotalsByDay[day]?.balance ?? 0}</div>
                          </div>
                        </div>
                      </button>

                      {expandedMobileDay === day && (
                        <div className="space-y-2 pb-2">
                          {visibleRows.map((row) => {
                            const cell = row.values.find((item) => item.day === day) ?? {
                              day,
                              added: 0,
                              removed: 0,
                              balance: 0,
                            };

                            return (
                              <div key={`${row.productId}-${day}`} className="rounded-xl border border-slate-200 bg-white p-3">
                                <div className="mb-2 text-sm font-semibold text-slate-800">{row.productName}</div>
                                <div className="grid grid-cols-3 gap-2 text-xs">
                                  <div className="rounded-md bg-emerald-50 px-2 py-1.5 text-center text-emerald-700">+{cell.added}</div>
                                  <div className="rounded-md bg-red-50 px-2 py-1.5 text-center text-red-700">-{cell.removed}</div>
                                  <div className="rounded-md bg-slate-100 px-2 py-1.5 text-center font-medium text-slate-700">{cell.balance}</div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                  <div className="space-y-2 pb-2">
                    {days.length === 0 && (
                      <div className="rounded-xl border border-slate-200 bg-white p-3 text-center text-xs text-slate-400">Сонгосон огноонд өгөгдөл алга</div>
                    )}
                  </div>
                </div>

                <div className="hidden md:block">
                  <table className="min-w-[1000px] w-full border-collapse text-xs">
                    <thead className="sticky top-0 z-20 bg-slate-100">
                      <tr>
                        <th rowSpan={2} className="sticky left-0 z-30 border border-slate-300 bg-slate-100 px-3 py-2 text-left text-[11px] font-semibold uppercase text-slate-600 min-w-[220px]">
                          Бараа
                        </th>
                        {days.map((day) => (
                          <th key={day} colSpan={3} className="border border-slate-300 px-2 py-2 text-center text-[11px] font-semibold text-slate-700">
                            {displayDate(day)}
                          </th>
                        ))}
                      </tr>
                      <tr>
                        {days.map((day) => (
                          <Fragment key={day}>
                            <th className="border border-slate-300 bg-emerald-50 px-2 py-1 text-center font-semibold text-emerald-700">Нэмэгдсэн</th>
                            <th className="border border-slate-300 bg-red-50 px-2 py-1 text-center font-semibold text-red-700">Хасагдсан</th>
                            <th className="border border-slate-300 bg-slate-50 px-2 py-1 text-center font-semibold text-slate-700">Үлдэгдэл</th>
                          </Fragment>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRows.map((row, rowIndex) => (
                        <tr key={row.productId} className={rowIndex % 2 === 0 ? "bg-white" : "bg-slate-50/40"}>
                          <td className="sticky left-0 z-10 border border-slate-300 bg-inherit px-3 py-1.5 text-sm text-slate-800 whitespace-nowrap">
                            {row.productName}
                          </td>
                          {row.values.map((cell) => (
                            <Fragment key={`${row.productId}-${cell.day}`}>
                              <td className="border border-slate-300 px-2 py-1 text-center text-emerald-700">{cell.added || ""}</td>
                              <td className="border border-slate-300 px-2 py-1 text-center text-red-700">{cell.removed || ""}</td>
                              <td className="border border-slate-300 px-2 py-1 text-center text-slate-700">{cell.balance}</td>
                            </Fragment>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-slate-400 bg-slate-100/90">
                        <td className="sticky left-0 z-10 border border-slate-300 bg-slate-100/90 px-3 py-1.5 text-sm font-semibold text-slate-800 whitespace-nowrap">
                          Нийт
                        </td>
                        {days.map((day) => (
                          <Fragment key={`total-${day}`}>
                            <td className="border border-slate-300 px-2 py-1 text-center font-semibold text-emerald-700">{visibleTotalsByDay[day]?.added ?? 0}</td>
                            <td className="border border-slate-300 px-2 py-1 text-center font-semibold text-red-700">{visibleTotalsByDay[day]?.removed ?? 0}</td>
                            <td className="border border-slate-300 px-2 py-1 text-center font-semibold text-slate-800">{visibleTotalsByDay[day]?.balance ?? 0}</td>
                          </Fragment>
                        ))}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
