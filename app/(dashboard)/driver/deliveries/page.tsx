"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Header from "@/components/layout/Header";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
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

function formatDateKey(value: string | null | undefined) {
  if (!value) return "-";
  const d = new Date(value);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

function toInputDate(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function shiftDate(dateKey: string, dayDelta: number) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const base = new Date(y, (m || 1) - 1, d || 1);
  base.setDate(base.getDate() + dayDelta);
  return toInputDate(base);
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

function buildOrderCopyText(order: DeliveryOrder): string {
  const address = order.shippingAddress || order.customer.address || "-";
  const items = order.items.length > 0
    ? order.items.map((item) => `${item.name} x${item.qty}`).join(", ")
    : "-";

  return `Утас: ${order.customer.phone}\nХаяг: ${address}\nБараа: ${items}`;
}

export default function DriverDeliveriesPage() {
  const todayDate = useMemo(() => toInputDate(new Date()), []);
  const saveTimersRef = useRef<{ [orderId: string]: ReturnType<typeof setTimeout> }>({});
  const [loading, setLoading] = useState(true);
  const [savingOrderId, setSavingOrderId] = useState("");
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [pendingStatuses, setPendingStatuses] = useState<Record<string, string>>({});
  const [selectedDate, setSelectedDate] = useState(todayDate);
  const [phoneSearch, setPhoneSearch] = useState("");

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

  const orderCount = useMemo(() => orders.length, [orders]);
  const filteredOrders = useMemo(() => {
    const keyword = phoneSearch.trim();
    if (!keyword) return orders;
    return orders.filter((order) => order.customer.phone.includes(keyword));
  }, [orders, phoneSearch]);
  const dailyDeliveredCount = useMemo(() => (
    orders.filter((order) => order.status === "DELIVERED").length
  ), [orders]);
  const dailyCancelledCount = useMemo(() => (
    orders.filter((order) => order.status === "CANCELLED").length
  ), [orders]);

  async function handleCopyOrderInfo(order: DeliveryOrder) {
    const text = buildOrderCopyText(order);
    try {
      await navigator.clipboard.writeText(text);
      alert("Захиалгын мэдээлэл хуулагдлаа");
    } catch {
      alert(text);
    }
  }

  async function saveStatus(orderId: string, targetStatus: string) {
    const current = orders.find((order) => order.id === orderId);
    if (!targetStatus || !current || targetStatus === current.status) return;

    setSavingOrderId(orderId);
    try {
      const response = await fetch(`/api/driver/deliveries/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: targetStatus }),
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

  function scheduleStatusSave(orderId: string, targetStatus: string) {
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

  return (
    <div>
      <Header title="Миний хүргэлт" subtitle="Өөрт хуваарилагдсан хүргэлтүүд" showSearch={false} />

      <div className="space-y-4 p-3 sm:space-y-5 sm:p-5">
        <Card>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <div className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">Нийт: {filteredOrders.length}/{orderCount} хүргэлт</div>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700"
              />
              <input
                type="text"
                value={phoneSearch}
                onChange={(e) => setPhoneSearch(e.target.value)}
                placeholder="Утасны дугаар хайх"
                className="w-[220px] rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700"
              />
              <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                Хүргэсэн: {dailyDeliveredCount}
              </div>
              <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                Цуцалсан: {dailyCancelledCount}
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Хүргэлт</CardTitle>
          </CardHeader>

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
              return (
                <div key={order.id} className="rounded-xl border border-slate-200 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs text-slate-500">{formatDateKey(order.delivery?.timeSlot?.date ?? order.createdAt)}</p>
                    </div>
                  </div>

                  <div className="mt-2 text-sm text-slate-700">
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
                    <p className="mt-1 text-xs text-slate-600">{order.shippingAddress || order.customer.address || "-"}</p>
                    <p className="mt-1 text-xs text-slate-500">Тайлбар: {order.notes || "-"}</p>
                  </div>

                  <div className="mt-2 space-y-1 text-xs text-slate-600">
                    {order.items.map((item) => (
                      <div key={item.id} className="grid grid-cols-[1fr_auto_auto] gap-2">
                        <p className="text-slate-700">{item.name}</p>
                        <p className="text-slate-500">x{item.qty}</p>
                        <p className="text-slate-500">{formatPrice(Number(item.unitPrice))}</p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-2 text-right text-sm font-semibold text-slate-800">
                    Нийт дүн: {formatPrice(orderTotal)}
                    {isPaymentReceived && <span className="ml-2 text-emerald-700">(Тооцоо орсон)</span>}
                  </div>

                  <div className="mt-3 space-y-2">
                    <select
                      value={nextStatus}
                      onChange={(e) => scheduleStatusSave(order.id, e.target.value)}
                      disabled={savingOrderId === order.id}
                      className={`w-full rounded-md border px-2 py-2 text-sm font-medium ${STATUS_CLASSES[nextStatus] ?? "border-slate-200 bg-white text-slate-700"}`}
                    >
                      {statusOptions.map((statusOption) => (
                        <option key={statusOption.value} value={statusOption.value}>
                          {statusOption.label}
                        </option>
                      ))}
                    </select>
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
                  return (
                    <tr key={order.id} className="align-top">
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
                      <td className="p-3 text-xs text-slate-600">{order.notes || "-"}</td>
                      <td className="p-3">
                        <select
                          value={nextStatus}
                          onChange={(e) => scheduleStatusSave(order.id, e.target.value)}
                          disabled={savingOrderId === order.id}
                          className={`rounded-md border px-2 py-1.5 text-sm font-medium ${STATUS_CLASSES[nextStatus] ?? "border-slate-200 bg-white text-slate-700"}`}
                        >
                          {statusOptions.map((statusOption) => (
                            <option key={statusOption.value} value={statusOption.value}>
                              {statusOption.label}
                            </option>
                          ))}
                        </select>
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
    </div>
  );
}
