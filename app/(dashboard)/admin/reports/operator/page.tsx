"use client";

import { useState, useEffect, useCallback } from "react";
import Header from "@/components/layout/Header";
import { Card } from "@/components/ui/Card";
import { formatPrice } from "@/lib/utils";
import toast from "react-hot-toast";

interface OrderItem {
  name: string;
  qty: number;
  total: number;
}

interface OrderRow {
  orderId: string;
  orderNumber: string;
  status: string;
  total: number;
  customerName: string;
  customerPhone: string;
  items: OrderItem[];
  createdAt: string;
}

interface OperatorGroup {
  operatorId: string;
  operatorName: string;
  totalOrders: number;
  totalAmount: number;
  orders: OrderRow[];
}

interface OperatorOption {
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

function todayString() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default function OperatorReportPage() {
  const [date, setDate] = useState(todayString());
  const [allGroups, setAllGroups] = useState<OperatorGroup[]>([]);
  const [operators, setOperators] = useState<OperatorOption[]>([]);
  const [selectedOperatorId, setSelectedOperatorId] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await window.fetch(`/api/reports/operator?date=${date}`);
      if (!res.ok) throw new Error("Failed");
      const json = await res.json();
      const data: OperatorGroup[] = json.data ?? [];
      setAllGroups(data);
      setOperators(data.map((g) => ({ id: g.operatorId, name: g.operatorName })));
    } catch {
      toast.error("Тайлан уншихад алдаа гарлаа");
    } finally {
      setIsLoading(false);
    }
  }, [date]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const groups = selectedOperatorId
    ? allGroups.filter((group) => group.operatorId === selectedOperatorId)
    : allGroups;

  const totals = groups.reduce(
    (acc, group) => {
      let delivered = 0;
      let cancelled = 0;

      for (const order of group.orders) {
        if (order.status === "DELIVERED") delivered += 1;
        if (order.status === "CANCELLED") cancelled += 1;
      }

      return {
        totalOrders: acc.totalOrders + group.totalOrders,
        delivered: acc.delivered + delivered,
        cancelled: acc.cancelled + cancelled,
      };
    },
    { totalOrders: 0, delivered: 0, cancelled: 0 },
  );

  return (
    <div>
      <Header title="Операторын тайлан" subtitle="Оператор тус бүрийн авсан захиалгын тайлан" />

      <div className="p-5 space-y-4">
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
            <label className="text-sm font-medium text-slate-600">Оператор</label>
            <select
              value={selectedOperatorId}
              onChange={(e) => setSelectedOperatorId(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-700
                focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[160px]"
            >
              <option value="">Бүх оператор</option>
              {operators.map((operator) => (
                <option key={operator.id} value={operator.id}>{operator.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <SummaryCard label="Нийт захиалга" value={totals.totalOrders} color="slate" />
          <SummaryCard label="Хүргэсэн" value={totals.delivered} color="green" />
          <SummaryCard label="Цуцалсан" value={totals.cancelled} color="red" />
        </div>

        {isLoading ? (
          <Card padding="none">
            <div className="p-12 text-center">
              <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-sm text-slate-400 mt-3">Ачааллаж байна...</p>
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
              <div className="px-5 py-4 border-b border-slate-100 bg-slate-50 rounded-t-2xl">
                <p className="font-semibold text-slate-800">{group.operatorName}</p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase w-10">#</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Огноо</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Утас</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Барааны жагсаалт</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase">Төлөв</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400 uppercase">Захиалгын дүн</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {group.orders.map((order, idx) => (
                      <tr key={order.orderId} className="hover:bg-slate-50/50 transition-colors align-top">
                        <td className="px-4 py-3 text-center text-slate-400">{idx + 1}</td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-700">
                            {new Date(order.createdAt).toLocaleDateString("mn-MN")}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-slate-700">{order.customerPhone}</td>
                        <td className="px-4 py-3 text-slate-600 min-w-[260px]">
                          {order.items.length === 0 ? (
                            <span className="text-slate-300">-</span>
                          ) : (
                            order.items.map((it, i) => (
                              <p key={`${order.orderId}-${i}`}>
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
                        <td className="px-4 py-3 text-right font-medium text-slate-700">{formatPrice(order.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ))
        )}
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
  color: "green" | "red" | "slate";
}) {
  const colors = {
    green: "bg-green-50 text-green-700",
    red: "bg-red-50 text-red-600",
    slate: "bg-slate-100 text-slate-700",
  };

  return (
    <div className={`w-[150px] rounded-xl p-2.5 ${colors[color]}`}>
      <p className="text-[11px] font-medium opacity-70 leading-tight">{label}</p>
      <p className="text-lg font-bold mt-0.5 leading-tight">{value}</p>
    </div>
  );
}
