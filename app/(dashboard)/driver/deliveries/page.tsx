"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Copy } from "lucide-react";
import { usePathname } from "next/navigation";
import Header from "@/components/layout/Header";
import { Card } from "@/components/ui/Card";
import Modal from "@/components/ui/Modal";
import { formatPrice } from "@/lib/utils";

interface DeliveryItem {
  id: string;
  name: string;
  qty: number;
  unitPrice: number;
}

interface DeliveryOrder {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  createdAt: string;
  updatedAt: string;
  effectiveDate?: string;
  notes: string | null;
  shippingAddress: string | null;
  delivery: {
    timeSlot: {
      date: string;
    } | null;
  } | null;
  customer: {
    id: string;
    name: string;
    phone: string;
    address: string | null;
  };
  items: DeliveryItem[];
}

const DRIVER_ACTION_STATUS_OPTIONS = [
  { value: "DELIVERED", label: "Хүргэсэн" },
  { value: "RETURNED", label: "Хойшлуулсан" },
  { value: "CANCELLED", label: "Цуцалсан" },
];

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Хүлээгдэж байгаа",
  CONFIRMED: "Хувиарласан",
  SHIPPED: "Илгээсэн",
  DELIVERED: "Хүргэсэн",
  RETURNED: "Хойшлуулсан",
  CANCELLED: "Цуцалсан",
};

const STATUS_CLASSES: Record<string, string> = {
  PENDING: "bg-sky-100 text-sky-700 border-sky-200",
  CONFIRMED: "bg-indigo-100 text-indigo-700 border-indigo-200",
  SHIPPED: "bg-indigo-100 text-indigo-700 border-indigo-200",
  DELIVERED: "bg-green-100 text-green-700 border-green-200",
  CANCELLED: "bg-red-100 text-red-700 border-red-200",
  RETURNED: "bg-slate-100 text-slate-700 border-slate-200",
};

function toInputDate(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function monthKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;
}

function parseMonthKey(value: string) {
  const [y, m] = value.split("-").map(Number);
  return new Date(y, (m || 1) - 1, 1);
}

function shiftMonth(value: string, monthDelta: number) {
  const base = parseMonthKey(value);
  base.setMonth(base.getMonth() + monthDelta);
  return monthKey(base);
}

function buildMonthDays(monthValue: string) {
  const [y, m] = monthValue.split("-").map(Number);
  const totalDays = new Date(y, m, 0).getDate();
  const days: Array<{ key: string; day: number; weekday: string }> = [];

  for (let day = 1; day <= totalDays; day += 1) {
    const date = new Date(y, m - 1, day);
    days.push({
      key: toInputDate(date),
      day,
      weekday: new Intl.DateTimeFormat("en-US", { weekday: "narrow" }).format(date),
    });
  }

  return days;
}

function getStatusOptions(currentStatus: string) {
  const options = [...DRIVER_ACTION_STATUS_OPTIONS];
  if (!options.some((option) => option.value === currentStatus)) {
    options.unshift({
      value: currentStatus,
      label: STATUS_LABELS[currentStatus] ?? currentStatus,
    });
  }
  return options;
}

const DELIVERY_STATUS_PRIORITY: Record<string, number> = {
  CONFIRMED: 0,
  SHIPPED: 0,
  RETURNED: 1,
  DELIVERED: 2,
  CANCELLED: 3,
};

type DriverStatusTab = "ALL" | "DELIVERED" | "RETURNED" | "CANCELLED";
type DriverBorderMarker = "blue" | "orange" | "green";

const DRIVER_STATUS_TABS: Array<{ value: DriverStatusTab; label: string }> = [
  { value: "ALL", label: "Нийт" },
  { value: "DELIVERED", label: "Хүргэсэн" },
  { value: "RETURNED", label: "Хойшилсон" },
  { value: "CANCELLED", label: "Цуцалсан" },
];

const TAB_STYLE_MAP: Record<DriverStatusTab, { active: string; inactive: string }> = {
  ALL: {
    active: "border-sky-500 bg-sky-500 text-white",
    inactive: "border-sky-200 bg-sky-50 text-sky-700",
  },
  DELIVERED: {
    active: "border-emerald-500 bg-emerald-500 text-white",
    inactive: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  RETURNED: {
    active: "border-amber-500 bg-amber-500 text-white",
    inactive: "border-amber-200 bg-amber-50 text-amber-700",
  },
  CANCELLED: {
    active: "border-rose-500 bg-rose-500 text-white",
    inactive: "border-rose-200 bg-rose-50 text-rose-700",
  },
};

const DRIVER_BORDER_MARKER_STYLES: Record<DriverBorderMarker, { border: string; ring: string; dot: string; label: string }> = {
  blue: {
    border: "border-sky-400",
    ring: "border-sky-300 bg-sky-50",
    dot: "bg-sky-500",
    label: "Цэнхэр",
  },
  orange: {
    border: "border-amber-400",
    ring: "border-amber-300 bg-amber-50",
    dot: "bg-amber-500",
    label: "Улбар шар",
  },
  green: {
    border: "border-emerald-400",
    ring: "border-emerald-300 bg-emerald-50",
    dot: "bg-emerald-500",
    label: "Ногоон",
  },
};

function sortDriverDeliveries(rows: DeliveryOrder[]) {
  return [...rows].sort((left, right) => {
    const leftPriority = DELIVERY_STATUS_PRIORITY[left.status] ?? 99;
    const rightPriority = DELIVERY_STATUS_PRIORITY[right.status] ?? 99;

    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }

    const leftUpdated = new Date(left.updatedAt).getTime();
    const rightUpdated = new Date(right.updatedAt).getTime();
    if (leftUpdated !== rightUpdated) {
      return rightUpdated - leftUpdated;
    }

    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  });
}

function tabMatchesStatus(tab: DriverStatusTab, status: string): boolean {
  if (tab === "ALL") return true;
  if (tab === "DELIVERED") {
    return status === "DELIVERED" || status === "LATE_DELIVERED";
  }
  return status === tab;
}

function buildOrderCopyText(order: DeliveryOrder): string {
  const address = order.shippingAddress || order.customer.address || "-";
  const items = order.items.length > 0
    ? order.items.map((item) => `${item.name} x${item.qty}`).join(", ")
    : "-";

  return `Утас: ${order.customer.phone}\nХаяг: ${address}\nБараа: ${items}`;
}

export default function DriverDeliveriesPage() {
  const pathname = usePathname();
  const todayDate = useMemo(() => toInputDate(new Date()), []);
  const saveTimersRef = useRef<{ [orderId: string]: ReturnType<typeof setTimeout> }>({});
  const dayStripRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingOrderId, setSavingOrderId] = useState("");
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [pendingStatuses, setPendingStatuses] = useState<Record<string, string>>({});
  const [borderMarkers, setBorderMarkers] = useState<Record<string, DriverBorderMarker | undefined>>({});
  const [selectedDate, setSelectedDate] = useState(todayDate);
  const [visibleMonth, setVisibleMonth] = useState(todayDate.slice(0, 7));
  const [phoneSearch, setPhoneSearch] = useState("");
  const [statusTab, setStatusTab] = useState<DriverStatusTab>("ALL");
  const [noteModalOrderId, setNoteModalOrderId] = useState("");
  const [noteModalStatus, setNoteModalStatus] = useState<"RETURNED" | "CANCELLED" | "">("");
  const [noteModalText, setNoteModalText] = useState("");
  const [noteModalPrefix, setNoteModalPrefix] = useState("");
  const [noteModalError, setNoteModalError] = useState("");

  const loadData = useCallback(async (dateKey?: string) => {
    setLoading(true);
    try {
      const dateParam = dateKey ?? selectedDate;
      const response = await fetch(`/api/driver/deliveries?date=${encodeURIComponent(dateParam)}`, { cache: "no-store" });
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error ?? "Мэдээлэл ачаалж чадсангүй");
      }

      const nextOrders = Array.isArray(json.deliveries) ? sortDriverDeliveries(json.deliveries) : [];
      setOrders(nextOrders);

      const nextPendingStatuses: Record<string, string> = {};
      for (const order of nextOrders) {
        nextPendingStatuses[order.id] = order.status;
      }
      setPendingStatuses(nextPendingStatuses);
    } catch (error) {
      console.error(error);
      alert("Мэдээлэл ачаалж чадсангүй");
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    void loadData();
  }, [selectedDate, loadData]);

  useEffect(() => {
    return () => {
      Object.values(saveTimersRef.current).forEach((timerId) => clearTimeout(timerId));
    };
  }, []);

  useEffect(() => {
    const selectedMonth = selectedDate.slice(0, 7);
    if (selectedMonth !== visibleMonth) {
      setVisibleMonth(selectedMonth);
    }
  }, [selectedDate, visibleMonth]);

  useEffect(() => {
    if (pathname !== "/driver/deliveries") return;

    const today = toInputDate(new Date());
    setSelectedDate(today);
    setVisibleMonth(today.slice(0, 7));
  }, [pathname]);

  useEffect(() => {
    if (!dayStripRef.current) return;

    const activeNode = dayStripRef.current.querySelector<HTMLButtonElement>(`button[data-day='${selectedDate}']`);
    if (!activeNode) return;

    activeNode.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [selectedDate, visibleMonth]);

  const getEffectiveStatus = useCallback((order: DeliveryOrder) => {
    return String(pendingStatuses[order.id] ?? order.status).toUpperCase();
  }, [pendingStatuses]);

  const tabCounts = useMemo(() => {
    const delivered = orders.filter((order) => tabMatchesStatus("DELIVERED", getEffectiveStatus(order))).length;
    const returned = orders.filter((order) => tabMatchesStatus("RETURNED", getEffectiveStatus(order))).length;
    const cancelled = orders.filter((order) => tabMatchesStatus("CANCELLED", getEffectiveStatus(order))).length;

    return {
      ALL: orders.length,
      DELIVERED: delivered,
      RETURNED: returned,
      CANCELLED: cancelled,
    } as const;
  }, [orders, getEffectiveStatus]);

  const filteredOrders = useMemo(() => {
    const statusFiltered = statusTab === "ALL"
      ? orders
      : orders.filter((order) => tabMatchesStatus(statusTab, getEffectiveStatus(order)));

    const keyword = phoneSearch.trim();
    if (!keyword) return statusFiltered;
    return statusFiltered.filter((order) => order.customer.phone.includes(keyword));
  }, [orders, phoneSearch, statusTab, getEffectiveStatus]);

  const monthDays = useMemo(() => buildMonthDays(visibleMonth), [visibleMonth]);
  const visibleMonthLabel = useMemo(() => {
    const date = parseMonthKey(visibleMonth);
    return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(date);
  }, [visibleMonth]);

  async function handleCopyOrderInfo(order: DeliveryOrder) {
    const text = buildOrderCopyText(order);
    try {
      await navigator.clipboard.writeText(text);
      alert("Захиалгын мэдээлэл хуулагдлаа");
    } catch {
      alert(text);
    }
  }

  function getAppendedNoteValue() {
    if (!noteModalText.trim()) return "";

    if (!noteModalPrefix) {
      return noteModalText.trim();
    }

    if (noteModalText.startsWith(noteModalPrefix)) {
      return noteModalText.slice(noteModalPrefix.length).trim();
    }

    return noteModalText.trim() === noteModalPrefix.trim()
      ? ""
      : noteModalText.trim();
  }

  async function saveStatus(orderId: string, targetStatus: string, appendNote?: string) {
    const current = orders.find((order) => order.id === orderId);
    if (!targetStatus || !current || targetStatus === current.status) return;

    setSavingOrderId(orderId);
    try {
      const response = await fetch(`/api/driver/deliveries/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: targetStatus,
          ...(appendNote ? { appendNote } : {}),
        }),
      });
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error ?? "Төлөв хадгалж чадсангүй");
      }

      await loadData();
    } catch (error: any) {
      console.error(error);
      setPendingStatuses((prev) => ({ ...prev, [orderId]: current.status }));
      alert(error?.message ?? "Төлөв хадгалж чадсангүй");
    } finally {
      setSavingOrderId("");
    }
  }

  function closeNoteModal() {
    const orderId = noteModalOrderId;
    setNoteModalOrderId("");
    setNoteModalStatus("");
    setNoteModalText("");
    setNoteModalPrefix("");
    setNoteModalError("");

    if (orderId) {
      const current = orders.find((order) => order.id === orderId);
      if (current) {
        setPendingStatuses((prev) => ({ ...prev, [orderId]: current.status }));
      }
    }
  }

  function openNoteModal(order: DeliveryOrder, targetStatus: "RETURNED" | "CANCELLED") {
    const previousNotes = order.notes?.trim() ?? "";
    const prefix = previousNotes ? `${previousNotes},\n` : "";

    setNoteModalOrderId(order.id);
    setNoteModalStatus(targetStatus);
    setNoteModalPrefix(prefix);
    setNoteModalText(prefix);
    setNoteModalError("");
    setPendingStatuses((prev) => ({ ...prev, [order.id]: targetStatus }));
  }

  async function confirmNoteModalSave() {
    const appendNote = getAppendedNoteValue();
    if (!noteModalOrderId || !noteModalStatus) {
      return;
    }

    if (!appendNote) {
      setNoteModalError("Тайлбар заавал оруулна уу");
      return;
    }

    const orderId = noteModalOrderId;
    const targetStatus = noteModalStatus;

    setNoteModalOrderId("");
    setNoteModalStatus("");
    setNoteModalText("");
    setNoteModalPrefix("");
    setNoteModalError("");

    await saveStatus(orderId, targetStatus, appendNote);
  }

  function scheduleStatusSave(orderId: string, targetStatus: string) {
    const current = orders.find((order) => order.id === orderId);
    if (!current || targetStatus === current.status) {
      return;
    }

    if (targetStatus === "RETURNED" || targetStatus === "CANCELLED") {
      openNoteModal(current, targetStatus);
      return;
    }

    setPendingStatuses((prev) => ({ ...prev, [orderId]: targetStatus }));

    const existingTimer = saveTimersRef.current[orderId];
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    saveTimersRef.current[orderId] = setTimeout(() => {
      delete saveTimersRef.current[orderId];
      void saveStatus(orderId, targetStatus);
    }, 700);
  }

  function toggleBorderMarker(orderId: string, marker: DriverBorderMarker) {
    setBorderMarkers((prev) => {
      const current = prev[orderId];
      if (current === marker) {
        const { [orderId]: _removed, ...rest } = prev;
        return rest;
      }
      return { ...prev, [orderId]: marker };
    });
  }

  return (
    <div>
      <Header title="Миний хүргэлт" showSearch={false} />

      <div className="space-y-3 p-2.5 sm:space-y-4 sm:p-4">
        <Card>
          <div className="space-y-2 p-2.5 sm:p-3">
            <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="w-full rounded-lg border border-slate-200 bg-slate-50 p-1.5">
                <div className="mb-1.5 flex items-center justify-between px-1">
                  <button
                    type="button"
                    onClick={() => setVisibleMonth((prev) => shiftMonth(prev, -1))}
                    className="rounded-md p-0.5 text-slate-600 hover:bg-white"
                    aria-label="Өмнөх сар"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <p className="text-xs font-semibold text-slate-700 sm:text-sm">{visibleMonthLabel}</p>
                  <button
                    type="button"
                    onClick={() => setVisibleMonth((prev) => shiftMonth(prev, 1))}
                    className="rounded-md p-0.5 text-slate-600 hover:bg-white"
                    aria-label="Дараах сар"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <div ref={dayStripRef} className="flex min-w-max items-center gap-1.5 px-1 pb-0.5">
                    {monthDays.map((day) => {
                      const isActive = day.key === selectedDate;
                      return (
                        <button
                          key={day.key}
                          data-day={day.key}
                          type="button"
                          onClick={() => setSelectedDate(day.key)}
                          className={`flex h-11 w-9 flex-none flex-col items-center justify-center rounded-lg border text-center transition ${isActive
                            ? "border-orange-500 bg-orange-500 text-white"
                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                            }`}
                        >
                          <span className="text-[9px] font-medium uppercase opacity-80">{day.weekday}</span>
                          <span className="text-xs font-semibold">{day.day}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-1.5">
                {DRIVER_STATUS_TABS.map((tab) => {
                  const isActive = statusTab === tab.value;
                  const tabStyle = TAB_STYLE_MAP[tab.value];
                  return (
                    <button
                      key={tab.value}
                      type="button"
                      onClick={() => setStatusTab(tab.value)}
                      className={`flex h-11 w-full flex-col items-center justify-center rounded-lg border text-center text-[10px] font-semibold leading-tight transition sm:h-12 sm:text-xs ${isActive ? `${tabStyle.active} shadow-sm` : `${tabStyle.inactive} hover:brightness-95`
                        }`}
                    >
                      <span className="block w-full text-center">{tab.label}</span>
                      <span className="mt-0.5 block w-full text-center text-[10px] font-bold">{tabCounts[tab.value]}</span>
                    </button>
                  );
                })}
            </div>

            <input
              type="text"
              value={phoneSearch}
              onChange={(e) => setPhoneSearch(e.target.value)}
              placeholder="Утасны дугаар хайх"
              className="h-9 w-full rounded-md border border-slate-200 px-2.5 text-xs text-slate-700 placeholder:text-xs"
            />

          </div>
        </Card>

        <Card>
          <div className="space-y-3 px-3 pb-3 sm:hidden">
            {!loading && filteredOrders.length === 0 && (
              <div className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-400">
                Сонгосон өдөрт таны хүргэлт алга байна.
              </div>
            )}

            {filteredOrders.map((order) => {
              const nextStatus = pendingStatuses[order.id] ?? order.status;
              const statusOptions = getStatusOptions(order.status);
              const isPaymentReceived = order.paymentStatus === "PAID";
              const orderTotal = order.items.reduce((sum, item) => sum + Number(item.unitPrice) * Number(item.qty), 0);
              const borderMarker = borderMarkers[order.id];
              const borderMarkerClass = borderMarker
                ? DRIVER_BORDER_MARKER_STYLES[borderMarker].border
                : "border-slate-200";
              return (
                <div key={order.id} className={`relative rounded-xl border-2 p-3 ${borderMarkerClass}`}>
                  <button
                    type="button"
                    onClick={() => void handleCopyOrderInfo(order)}
                    aria-label="Захиалгын мэдээлэл хуулах"
                    className="absolute right-3 top-3 rounded-md border border-slate-300 p-1.5 text-slate-600 hover:bg-slate-50"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>

                  <div className="mt-2 border-b border-slate-100 pb-2 text-sm text-slate-700">
                    <div className="flex items-center gap-2">
                      <a href={`tel:${order.customer.phone.replace(/\s+/g, "")}`} className="text-sm font-semibold text-blue-600 underline underline-offset-2">
                        {order.customer.phone}
                      </a>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">{order.shippingAddress || order.customer.address || "-"}</p>
                    {order.notes?.trim() && (
                      <p className="mt-1 whitespace-pre-line text-sm text-slate-500">Тайлбар: {order.notes}</p>
                    )}
                  </div>

                  <div className="mt-2 border-b border-slate-100 pb-2 space-y-1 text-sm text-slate-600">
                    {order.items.map((item) => (
                      <div key={item.id} className="grid grid-cols-[1fr_auto_auto] gap-2">
                        <p className="font-medium text-slate-700">{item.name}</p>
                        <p className="font-medium text-slate-500">x{item.qty}</p>
                        <p className="font-medium text-slate-500">{formatPrice(Number(item.unitPrice))}</p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-2 border-b border-slate-100 pb-2 text-right text-sm font-semibold text-slate-800">
                    Нийт дүн: {formatPrice(orderTotal)}
                    {isPaymentReceived && <span className="ml-2 text-emerald-700">(Тооцоо орсон)</span>}
                  </div>

                  <div className="mt-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <select
                        value={nextStatus}
                        onChange={(e) => scheduleStatusSave(order.id, e.target.value)}
                        disabled={savingOrderId === order.id}
                        className={`h-9 min-w-0 flex-1 rounded-md border px-2 text-xs font-medium ${STATUS_CLASSES[nextStatus] ?? "border-slate-200 bg-white text-slate-700"}`}
                      >
                        {statusOptions.map((statusOption) => (
                          <option key={statusOption.value} value={statusOption.value}>
                            {statusOption.label}
                          </option>
                        ))}
                      </select>

                      {(["blue", "orange", "green"] as DriverBorderMarker[]).map((marker) => {
                        const style = DRIVER_BORDER_MARKER_STYLES[marker];
                        const selected = borderMarker === marker;
                        return (
                          <button
                            key={`${order.id}-${marker}`}
                            type="button"
                            onClick={() => toggleBorderMarker(order.id, marker)}
                            title={style.label}
                            aria-label={`${style.label} хүрээ`}
                            className={`grid h-8 w-8 place-items-center rounded-md border ${selected ? style.ring : "border-slate-300 bg-white"}`}
                          >
                            <span className={`h-3.5 w-3.5 rounded-full ${style.dot}`} />
                          </button>
                        );
                      })}
                    </div>
                    {savingOrderId === order.id && <p className="text-xs text-slate-500">Хадгалж байна...</p>}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-semibold text-slate-500">
                  <th className="p-3">Харилцагч</th>
                  <th className="p-3">Бараа</th>
                  <th className="p-3">Тоо</th>
                  <th className="p-3">Үнэ</th>
                  <th className="p-3">Хаяг</th>
                  <th className="p-3">Тайлбар</th>
                  <th className="p-3">Төлөв</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {!loading && filteredOrders.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-400">
                      Сонгосон өдөрт таны хүргэлт алга байна.
                    </td>
                  </tr>
                )}

                {filteredOrders.map((order) => {
                  const nextStatus = pendingStatuses[order.id] ?? order.status;
                  const statusOptions = getStatusOptions(order.status);
                  const isPaymentReceived = order.paymentStatus === "PAID";
                  const orderTotal = order.items.reduce((sum, item) => sum + Number(item.unitPrice) * Number(item.qty), 0);
                  const borderMarker = borderMarkers[order.id];
                  const rowBorderClass = borderMarker
                    ? DRIVER_BORDER_MARKER_STYLES[borderMarker].border
                    : "border-slate-100";
                  return (
                    <tr key={order.id} className={`align-top border-l-2 ${rowBorderClass}`}>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <a href={`tel:${order.customer.phone.replace(/\s+/g, "")}`} className="text-xs font-medium text-blue-600 underline underline-offset-2">
                            {order.customer.phone}
                          </a>
                          <button
                            type="button"
                            onClick={() => void handleCopyOrderInfo(order)}
                            className="rounded border border-slate-300 px-1.5 py-0.5 text-[10px] text-slate-600 hover:bg-slate-50"
                          >
                            Хуулах
                          </button>
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="space-y-1 text-xs text-slate-600">
                          {order.items.map((item) => (
                            <div key={item.id}>{item.name}</div>
                          ))}
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="space-y-1 text-xs text-slate-600">
                          {order.items.map((item) => (
                            <div key={item.id}>x{item.qty}</div>
                          ))}
                        </div>
                      </td>
                      <td className="p-3">
                        <div className={`text-xs ${isPaymentReceived ? "font-semibold text-emerald-700" : "text-slate-700"}`}>
                          <div>{formatPrice(orderTotal)}</div>
                          {isPaymentReceived && <div className="mt-1 text-emerald-700">Тооцоо орсон</div>}
                        </div>
                      </td>
                      <td className="p-3 text-xs text-slate-600">{order.shippingAddress || order.customer.address || "-"}</td>
                      <td className="p-3 text-xs whitespace-pre-wrap text-slate-600">{order.notes?.trim() || ""}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <select
                            value={nextStatus}
                            onChange={(e) => scheduleStatusSave(order.id, e.target.value)}
                            disabled={savingOrderId === order.id}
                            className={`h-8 rounded-md border px-2 text-xs font-medium ${STATUS_CLASSES[nextStatus] ?? "border-slate-200 bg-white text-slate-700"}`}
                          >
                            {statusOptions.map((statusOption) => (
                              <option key={statusOption.value} value={statusOption.value}>
                                {statusOption.label}
                              </option>
                            ))}
                          </select>

                          {(["blue", "orange", "green"] as DriverBorderMarker[]).map((marker) => {
                            const style = DRIVER_BORDER_MARKER_STYLES[marker];
                            const selected = borderMarker === marker;
                            return (
                              <button
                                key={`${order.id}-desktop-${marker}`}
                                type="button"
                                onClick={() => toggleBorderMarker(order.id, marker)}
                                title={style.label}
                                aria-label={`${style.label} хүрээ`}
                                className={`grid h-7 w-7 place-items-center rounded-md border ${selected ? style.ring : "border-slate-300 bg-white"}`}
                              >
                                <span className={`h-3 w-3 rounded-full ${style.dot}`} />
                              </button>
                            );
                          })}
                        </div>
                        {savingOrderId === order.id && <p className="mt-1 text-[11px] text-slate-500">Хадгалж байна...</p>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Modal
        isOpen={Boolean(noteModalOrderId && noteModalStatus)}
        onClose={closeNoteModal}
        title={noteModalStatus === "RETURNED" ? "Хойшлуулсан тайлбар" : "Цуцалсан тайлбар"}
        size="sm"
        footer={(
          <>
            <button
              type="button"
              onClick={closeNoteModal}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              Болих
            </button>
            <button
              type="button"
              onClick={() => void confirmNoteModalSave()}
              className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Хадгалах
            </button>
          </>
        )}
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            {noteModalStatus === "RETURNED"
              ? "Хойшлуулсан төлөв хадгалахын өмнө тайлбар оруулна уу."
              : "Цуцалсан төлөв хадгалахын өмнө тайлбар оруулна уу."}
          </p>
          <textarea
            value={noteModalText}
            onChange={(e) => {
              setNoteModalText(e.target.value);
              if (noteModalError) {
                setNoteModalError("");
              }
            }}
            placeholder="Тайлбар бичнэ үү"
            rows={5}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
          />
          {noteModalError && <p className="text-sm text-rose-600">{noteModalError}</p>}
        </div>
      </Modal>
    </div>
  );
}
