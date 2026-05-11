"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Header from "@/components/layout/Header";
import { Card } from "@/components/ui/Card";
import { Check, ChevronDown } from "lucide-react";
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

const ACTION_TYPE_OPTIONS = [
  { value: "STATUS_CHANGED", label: "Төлөв" },
  { value: "DRIVER_CHANGED", label: "Жолооч" },
  { value: "NOTES_CHANGED", label: "Тэмдэглэл" },
  { value: "ADDRESS_CHANGED", label: "Хаяг" },
];

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
  const [selectedActionTypes, setSelectedActionTypes] = useState<string[]>([]);
  const [openActionTypeDropdownGroupId, setOpenActionTypeDropdownGroupId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!openActionTypeDropdownGroupId) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-action-type-dropdown]") && !target.closest("[data-action-type-button]")) {
        setOpenActionTypeDropdownGroupId(null);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [openActionTypeDropdownGroupId]);

  const handleActionTypeButtonClick = (groupId: string) => {
    setOpenActionTypeDropdownGroupId((current) => (current === groupId ? null : groupId));
  };

  const toggleActionType = (value: string) => {
    setSelectedActionTypes((current) =>
      current.includes(value) ? current.filter((v) => v !== value) : [...current, value]
    );
  };

  const toggleAllActionTypes = () => {
    setSelectedActionTypes((current) =>
      current.length === ACTION_TYPE_OPTIONS.length
        ? []
        : ACTION_TYPE_OPTIONS.map((opt) => opt.value)
    );
  };

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ fromDate, toDate });
      const res = await window.fetch(`/api/reports/operator-entries?${params.toString()}`);
      if (!res.ok) throw new Error("Failed");

      const json = await res.json();
      const data: EntryGroup[] = json.data ?? [];
      const normalizedData = data.map((group) => ({
        ...group,
        operatorId: String(group.operatorId ?? ""),
      }));
      setAllGroups(normalizedData);

      const operatorMap = new Map<string, string>();
      for (const group of normalizedData) {
        if (!operatorMap.has(group.operatorId)) {
          operatorMap.set(group.operatorId, group.operatorName);
        }
      }
      setOperators(Array.from(operatorMap.entries()).map(([id, name]) => ({ id, name })));
    } catch {
      toast.error("Тайлан уншихад алдаа гарлаа");
    } finally {
      setIsLoading(false);
    }
  }, [fromDate, toDate]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const groups = useMemo(() => {
    let result = selectedOperatorId
      ? allGroups.filter((group) => String(group.operatorId) === selectedOperatorId)
      : allGroups;
    if (selectedActionTypes.length > 0) {
      const matchActions = selectedActionTypes.flatMap((t) =>
        t === "NOTES_CHANGED" ? ["NOTES_CHANGED", "NOTE_ADDED"] : [t]
      );
      result = result.map((group) => {
        const filtered = group.entries.filter((e) => matchActions.includes(e.action));
        return { ...group, entries: filtered, totalEntries: filtered.length };
      }).filter((group) => group.totalEntries > 0);
    }
    return result;
  }, [allGroups, selectedOperatorId, selectedActionTypes]);

  const allFilteredEntries = groups.flatMap((g) => g.entries);
  const totalEntries = allFilteredEntries.length;
  const countByType = (action: string) =>
    allFilteredEntries.filter((e) => [
      ...(action === "NOTES_CHANGED" ? ["NOTES_CHANGED", "NOTE_ADDED"] : []),
      ...(action !== "NOTES_CHANGED" ? [action] : []),
    ].includes(e.action)).length;

  const actionTypeLabel =
    selectedActionTypes.length === 0
      ? "Бүгд"
      : selectedActionTypes.length === 1
      ? ACTION_TYPE_OPTIONS.find((o) => o.value === selectedActionTypes[0])?.label ?? "Төрөл"
      : `${selectedActionTypes.length} төрөл`;

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
          <div className="w-[130px] rounded-xl bg-slate-100 p-2.5 text-slate-700">
            <p className="mt-0.5 text-[11px] font-medium leading-tight opacity-70">Нийт бичлэг</p>
            <p className="text-lg font-bold leading-tight">{totalEntries}</p>
          </div>
          <div className="w-[110px] rounded-xl bg-blue-50 p-2.5 text-blue-700">
            <p className="mt-0.5 text-[11px] font-medium leading-tight opacity-70">Төлөв</p>
            <p className="text-lg font-bold leading-tight">{countByType("STATUS_CHANGED")}</p>
          </div>
          <div className="w-[110px] rounded-xl bg-indigo-50 p-2.5 text-indigo-700">
            <p className="mt-0.5 text-[11px] font-medium leading-tight opacity-70">Жолооч</p>
            <p className="text-lg font-bold leading-tight">{countByType("DRIVER_CHANGED")}</p>
          </div>
          <div className="w-[110px] rounded-xl bg-yellow-50 p-2.5 text-yellow-700">
            <p className="mt-0.5 text-[11px] font-medium leading-tight opacity-70">Тэмдэглэл</p>
            <p className="text-lg font-bold leading-tight">{countByType("NOTES_CHANGED")}</p>
          </div>
          <div className="w-[110px] rounded-xl bg-green-50 p-2.5 text-green-700">
            <p className="mt-0.5 text-[11px] font-medium leading-tight opacity-70">Хаяг</p>
            <p className="text-lg font-bold leading-tight">{countByType("ADDRESS_CHANGED")}</p>
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
                <div className="max-h-[560px] overflow-y-auto" style={{ scrollbarGutter: "stable" }}>
                  <table className="w-full table-fixed text-sm">
                    <thead className="sticky top-0 z-10">
                      <tr className="border-b border-slate-100 bg-slate-50">
                        <th className="w-12 px-4 py-3 text-center text-xs font-semibold uppercase text-slate-400">#</th>
                        <th className="w-[210px] px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400">Огноо / Цаг</th>
                        <th className="w-[140px] px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400">Утас</th>
                        <th className="w-[140px] px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400 normal-case">
                          <div className="relative" data-action-type-dropdown>
                          <button
                            data-action-type-button
                            type="button"
                            onClick={() => handleActionTypeButtonClick(group.operatorId)}
                            className="flex w-full items-center justify-between gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <span className="truncate">{actionTypeLabel}</span>
                            <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${openActionTypeDropdownGroupId === group.operatorId ? "rotate-180" : ""}`} />
                          </button>
                          {openActionTypeDropdownGroupId === group.operatorId && (
                            <div className="absolute left-0 top-[calc(100%+4px)] z-20 min-w-[140px] rounded-md border border-slate-200 bg-white p-1 shadow-lg">
                              <button
                                type="button"
                                onClick={toggleAllActionTypes}
                                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[11px] text-slate-700 hover:bg-slate-100"
                              >
                                <span className={`inline-flex h-3.5 w-3.5 items-center justify-center rounded border ${selectedActionTypes.length === ACTION_TYPE_OPTIONS.length ? "border-blue-500 bg-blue-500 text-white" : "border-slate-300 bg-white text-transparent"}`}>
                                  <Check className="h-3 w-3" />
                                </span>
                                <span>Бүгд</span>
                              </button>
                              <div className="my-1 border-t border-slate-100" />
                              {ACTION_TYPE_OPTIONS.map((opt) => (
                                <button
                                  key={opt.value}
                                  type="button"
                                  onClick={() => toggleActionType(opt.value)}
                                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[11px] text-slate-700 hover:bg-slate-100"
                                >
                                  <span className={`inline-flex h-3.5 w-3.5 items-center justify-center rounded border ${selectedActionTypes.includes(opt.value) ? "border-blue-500 bg-blue-500 text-white" : "border-slate-300 bg-white text-transparent"}`}>
                                    <Check className="h-3 w-3" />
                                  </span>
                                  <span>{opt.label}</span>
                                </button>
                              ))}
                            </div>
                          )}
                          </div>
                        </th>
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
