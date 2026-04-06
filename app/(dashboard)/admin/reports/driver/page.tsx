"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Header from "@/components/layout/Header";
import { Card } from "@/components/ui/Card";
import { formatPrice } from "@/lib/utils";
import toast from "react-hot-toast";

interface DriverOrderItem {
  id: string;
  name: string;
  qty: number;
  total: number;
}

interface DriverOrderRow {
  orderId: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  total: number;
  driverFee: number;
  companyAmount: number;
  customerName: string;
  customerPhone: string;
  createdAt: string;
  deliveredAt?: string;
  items: DriverOrderItem[];
}

interface DriverOrderTableRow extends DriverOrderRow {
  driverId: string;
  driverName: string;
}

interface DriverGroup {
  driverId: string;
  driverName: string;
  delivered: number;
  cancelled: number;
  returned: number;
  totalOrders: number;
  deliveredAmount: number;
  totalAmount: number;
  driverFee: number;
  companyPayout: number;
  orders: DriverOrderRow[];
}

interface DriverOption {
  id: string;
  name: string;
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Хүлээгдэж байна",
  CONFIRMED: "Баталгаажсан",
  PACKED: "Савласан",
  SHIPPED: "Илгээсэн",
  DELIVERED: "Хүргэсэн",
  CANCELLED: "Цуцалсан",
  RETURNED: "Хойшлуулсан",
};

const STATUS_COLOR: Record<string, string> = {
  PENDING: "bg-yellow-50 text-yellow-700",
  CONFIRMED: "bg-blue-50 text-blue-700",
  PACKED: "bg-purple-50 text-purple-700",
  SHIPPED: "bg-indigo-50 text-indigo-700",
  DELIVERED: "bg-green-50 text-green-700",
  CANCELLED: "bg-red-50 text-red-600",
  RETURNED: "bg-orange-50 text-orange-600",
};

const PAYMENT_LABEL: Record<string, string> = {
  PAID: "Тооцоо орсон",
  UNPAID: "Тооцоо ороогүй",
  PARTIAL: "Хэсэгчлэн",
  REFUNDED: "Буцаасан",
};

function todayString() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default function DriverReportPage() {
  const [date, setDate] = useState(todayString());
  const [allGroups, setAllGroups] = useState<DriverGroup[]>([]);
  const [drivers, setDrivers] = useState<DriverOption[]>([]);
  const [selectedDriverId, setSelectedDriverId] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);

  // Fetch driver list once
  useEffect(() => {
    window.fetch("/api/orders/meta")
      .then((r) => r.json())
      .then((json) => setDrivers(json.drivers ?? []))
      .catch(() => {});
  }, []);

  const fetchReport = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await window.fetch(`/api/reports/driver?date=${date}`);
      if (!res.ok) throw new Error("Failed");
      const json = await res.json();
      setAllGroups(json.data ?? []);
    } catch {
      toast.error("Тайлан уншихад алдаа гарлаа");
    } finally {
      setIsLoading(false);
    }
  }, [date]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  const groups = useMemo(
    () => (selectedDriverId
      ? allGroups.filter((r) => r.driverId === selectedDriverId)
      : allGroups),
    [allGroups, selectedDriverId],
  );

  const tableRows = useMemo<DriverOrderTableRow[]>(() => (
    groups
      .flatMap((group) => group.orders.map((order) => ({
        ...order,
        driverId: group.driverId,
        driverName: group.driverName,
      })))
      .sort((a, b) => {
        const aTs = new Date(a.deliveredAt ?? a.createdAt).getTime();
        const bTs = new Date(b.deliveredAt ?? b.createdAt).getTime();
        return bTs - aTs;
      })
  ), [groups]);

  const totals = groups.reduce(
    (acc, r) => ({
      totalOrders: acc.totalOrders + r.totalOrders,
      delivered: acc.delivered + r.delivered,
      cancelled: acc.cancelled + r.cancelled,
      returned: acc.returned + r.returned,
      deliveredAmount: acc.deliveredAmount + r.deliveredAmount,
      totalAmount: acc.totalAmount + r.totalAmount,
      driverFee: acc.driverFee + r.driverFee,
      companyPayout: acc.companyPayout + r.companyPayout,
    }),
    {
      totalOrders: 0,
      delivered: 0,
      cancelled: 0,
      returned: 0,
      deliveredAmount: 0,
      totalAmount: 0,
      driverFee: 0,
      companyPayout: 0,
    }
  );

  return (
    <div>
      <Header title="Жолоочийн тайлан" subtitle="Жолооч тус бүрийн хүргэлтийн тайлан" />

      <div className="p-5 space-y-4">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-slate-600">Огноо</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-700
                focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-slate-600">Жолооч</label>
            <select
              value={selectedDriverId}
              onChange={(e) => setSelectedDriverId(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-700
                focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[160px]"
            >
              <option value="">Бүх жолооч</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <SummaryCard label="Нийт захиалга" value={totals.totalOrders} color="slate" />
          <SummaryCard label="Хүргэсэн" value={totals.delivered} color="green" />
          <SummaryCard label="Цуцалсан" value={totals.cancelled} color="red" />
          <SummaryCard label="Хойшлуулсан" value={totals.returned} color="orange" />
        </div>

        {isLoading ? (
          <Card padding="none">
            <div className="p-12 text-center">
              <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-sm text-slate-400 mt-3">Ачааллаж байна...</p>
            </div>
          </Card>
        ) : tableRows.length === 0 ? (
          <Card padding="none">
            <div className="py-14 text-center text-sm text-slate-400">
              Өгөгдөл олдсонгүй
            </div>
          </Card>
        ) : (
          <Card padding="none">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase w-10">#</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Огноо</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Жолооч</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Утас</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Хүргэсэн бараа</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase">Төлөв</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase">Төлбөр</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400 uppercase">Захиалгын дүн</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400 uppercase">Жолооч</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400 uppercase">Тушаах дүн</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {tableRows.map((order, idx) => (
                    <tr key={`${order.driverId}-${order.orderId}`} className="hover:bg-slate-50/50 transition-colors align-top">
                      <td className="px-4 py-3 text-center text-slate-400">{idx + 1}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-700">
                          {new Date(order.deliveredAt ?? order.createdAt).toLocaleDateString("mn-MN")}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-slate-700 font-medium whitespace-nowrap">{order.driverName}</td>
                      <td className="px-4 py-3 text-slate-700">{order.customerPhone}</td>
                      <td className="px-4 py-3 text-slate-600 min-w-[260px]">
                        {order.items.length === 0 ? (
                          <span className="text-slate-300">-</span>
                        ) : (
                          order.items.map((it) => (
                            <p key={it.id}>
                              {it.name} ×{it.qty}
                            </p>
                          ))
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center px-2 py-1 rounded-lg text-xs font-medium ${STATUS_COLOR[order.status] ?? "bg-slate-100 text-slate-600"}`}>
                          {STATUS_LABEL[order.status] ?? order.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center px-2 py-1 rounded-lg text-xs font-medium ${order.paymentStatus === "PAID" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                          {PAYMENT_LABEL[order.paymentStatus] ?? order.paymentStatus}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-slate-700">{formatPrice(order.total)}</td>
                      <td className="px-4 py-3 text-right font-medium text-violet-600">{formatPrice(order.driverFee)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-800">{formatPrice(order.companyAmount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 border-t border-slate-200">
                    <td colSpan={7} className="px-4 py-3 text-sm font-semibold text-slate-600">Тайлангийн мэдээлэл</td>
                    <td className="px-4 py-3 text-right font-bold text-slate-700">{formatPrice(totals.deliveredAmount)}</td>
                    <td className="px-4 py-3 text-right font-bold text-violet-600">{formatPrice(totals.driverFee)}</td>
                    <td className="px-4 py-3 text-right font-bold text-slate-800">{formatPrice(totals.companyPayout)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>
        )}

        <p className="text-xs text-slate-400">
          * Хүргэсэн захиалга бүрт жолооч 6,000₮ бодогдоно. &nbsp;|&nbsp;
          Тооцоо орсон (PAID) үед компанид орох дүн 0 болно. &nbsp;|&nbsp;
          Бусад хүргэсэн захиалгад компанид орох = захиалгын дүн − 6,000₮
        </p>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number | string;
  color: "green" | "red" | "orange" | "blue" | "sky" | "violet" | "slate";
}) {
  const colors = {
    green: "bg-green-50 text-green-700",
    red: "bg-red-50 text-red-600",
    orange: "bg-orange-50 text-orange-600",
    blue: "bg-blue-50 text-blue-700",
    sky: "bg-cyan-50 text-cyan-700",
    violet: "bg-violet-50 text-violet-600",
    slate: "bg-slate-100 text-slate-700",
  };
  return (
    <div className={`w-[150px] rounded-xl p-2.5 ${colors[color]}`}>
      <p className="text-[11px] font-medium opacity-70 leading-tight">{label}</p>
      <p className="text-lg font-bold mt-0.5 leading-tight">{value}</p>
    </div>
  );
}
