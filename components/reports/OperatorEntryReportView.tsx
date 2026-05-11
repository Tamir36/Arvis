"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Header from "@/components/layout/Header";
import { Card } from "@/components/ui/Card";
import toast from "react-hot-toast";

interface EntryRow {
  orderId: string;
  orderNumber: string;
  customerPhone: string;
  action: string;
  oldValue: string;
  value: string;
  createdAt: string;
}

interface EntryGroup {
  operatorId: string;
  operatorName: string;
  totalEntries: number;
  entries: EntryRow[];
}

interface OperatorOption {
  id: string;
  name: string;
}

const ENTRY_ACTION_LABEL: Record<string, string> = {
  ADDRESS_CHANGED: "Хаяг",
  NOTES_CHANGED: "Тэмдэглэл",
  NOTE_ADDED: "Тэмдэглэл",
  STATUS_CHANGED: "Төлөв",
  DRIVER_CHANGED: "Жолооч",
};

function todayString() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default function OperatorEntryReportView() {
  const [fromDate, setFromDate] = useState(todayString());
  const [toDate, setToDate] = useState(todayString());
  const [allGroups, setAllGroups] = useState<EntryGroup[]>([]);
  const [operators, setOperators] = useState<OperatorOption[]>([]);
  const [selectedOperatorId, setSelectedOperatorId] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ fromDate, toDate });
      const res = await window.fetch(`/api/reports/operator-entries?${params.toString()}`);
      if (!res.ok) throw new Error("Failed");

      const json = await res.json();
      const data: EntryGroup[] = json.data ?? [];
      setAllGroups(data);
      setOperators(data.map((group) => ({ id: group.operatorId, name: group.operatorName })));
    } catch {
      toast.error("Тайлан уншихад алдаа гарлаа");
    } finally {
      setIsLoading(false);
    }
  }, [fromDate, toDate]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const groups = useMemo(
    () => (selectedOperatorId ? allGroups.filter((group) => group.operatorId === selectedOperatorId) : allGroups),
    [allGroups, selectedOperatorId],
  );

  const totalEntries = groups.reduce((sum, group) => sum + group.totalEntries, 0);

  return (
    <div>
      <Header
        title="Тэмдэглэл/хаяг тайлан"
        subtitle="Тухайн өдөр операторын хийсэн хаяг, тэмдэглэл, төлөв, жолоочийн өөрчлөлтийн тайлан"
      />

      <div className="space-y-4 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-slate-600">Оператор</label>
            <select
              value={selectedOperatorId}
              onChange={(e) => setSelectedOperatorId(e.target.value)}
              className="min-w-[160px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Бүх оператор</option>
              {operators.map((operator) => (
                <option key={operator.id} value={operator.id}>{operator.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <div className="w-[170px] rounded-xl bg-slate-100 p-2.5 text-slate-700">
            <p className="mt-0.5 text-[11px] font-medium leading-tight opacity-70">Нийт бичлэг</p>
            <p className="text-lg font-bold leading-tight">{totalEntries}</p>
          </div>
        </div>

        {isLoading ? (
          <Card padding="none">
            <div className="p-12 text-center">
              <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
              <p className="mt-3 text-sm text-slate-400">Ачааллаж байна...</p>
            </div>
          </Card>
        ) : groups.length === 0 ? (
          <Card padding="none">
            <div className="py-14 text-center text-sm text-slate-400">
              Өгөгдөл олдсонгүй
            </div>
          </Card>
        ) : (
          groups.map((group) => (
            <Card key={group.operatorId} padding="none">
              <div className="rounded-t-2xl border-b border-slate-100 bg-slate-50 px-5 py-4">
                <p className="font-semibold text-slate-800">{group.operatorName}</p>
              </div>

              <div className="overflow-x-auto">
                <div className="max-h-[560px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10">
                      <tr className="border-b border-slate-100 bg-slate-50">
                        <th className="w-10 px-4 py-3 text-center text-xs font-semibold uppercase text-slate-400">#</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400">Огноо / Цаг</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400">Утас</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400">Захиалга</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400">Төрөл</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400">Утга</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {group.entries.map((entry, idx) => (
                        <tr key={`${entry.orderId}-${entry.action}-${entry.createdAt}`} className="align-top transition-colors hover:bg-slate-50/50">
                          <td className="px-4 py-3 text-center text-slate-400">{idx + 1}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                            {new Date(entry.createdAt).toLocaleString("mn-MN")}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-slate-700">{entry.customerPhone}</td>
                          <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-700">{entry.orderNumber}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-slate-600">{ENTRY_ACTION_LABEL[entry.action] ?? entry.action}</td>
                          <td className="min-w-[260px] px-4 py-3 text-slate-700">
                            <p className="break-all">{entry.value || "-"}</p>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="border-t border-slate-100 bg-white px-5 py-3 text-right text-sm font-semibold text-slate-700">
                Нийт бичлэг: {group.totalEntries}
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
