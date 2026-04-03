"use client";

import { useEffect, useState } from "react";
import { formatPrice, formatDate } from "@/lib/utils";
import { Card } from "@/components/ui/Card";
import StatsCard from "@/components/ui/StatsCard";
import Badge, { orderStatusBadge } from "@/components/ui/Badge";
import Header from "@/components/layout/Header";
import Link from "next/link";
import {
  ShoppingCart,
  Package,
  Users,
  TrendingUp,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { mn } from "@/locales/mn";

interface DashboardData {
  totalOrders: number;
  totalProducts: number;
  totalCustomers: number;
  totalRevenue: number;
  recentOrders: any[];
  lowStockProducts: any[];
  monthlyData: any[];
  statusData: any[];
}

const STATUS_COLORS = ["#2563eb", "#f97316", "#10b981", "#8b5cf6", "#ef4444", "#6b7280", "#f59e0b"];

export default function AdminDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const response = await fetch("/api/dashboard/stats");
        if (!response.ok) {
          throw new Error("Failed to fetch dashboard data");
        }
        const json = await response.json();
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  if (loading) {
    return (
      <div>
        <Header title="Хянах самбар" subtitle="Системийн ерөнхий мэдээлэл" />
        <div className="p-5">
          <div className="text-center py-20">
            <div className="inline-block">
              <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
            </div>
            <p className="mt-4 text-slate-600">Өгөгдөл ачаалж байна...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div>
        <Header title="Хянах самбар" subtitle="Системийн ерөнхий мэдээлэл" />
        <div className="p-5">
          <Card className="bg-red-50 border-red-200">
            <p className="text-red-800 font-medium">❌ Алдаа: {error || "Өгөгдөл ачаалж чадсан"}</p>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header title="Хянах самбар" subtitle="Системийн ерөнхий мэдээлэл" />

      <div className="p-5 space-y-5">
        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatsCard
            title={mn.stats.totalRevenue}
            value={formatPrice(data.totalRevenue)}
            icon={<TrendingUp className="w-5 h-5" />}
            color="orange"
            trend={{ value: 12, label: "өмнөх сараас" }}
          />
          <StatsCard
            title={mn.stats.totalOrders}
            value={data.totalOrders}
            icon={<ShoppingCart className="w-5 h-5" />}
            color="blue"
            trend={{ value: 8, label: "өмнөх сараас" }}
          />
          <StatsCard
            title={mn.stats.activeProducts}
            value={data.totalProducts}
            icon={<Package className="w-5 h-5" />}
            color="green"
          />
          <StatsCard
            title={mn.stats.totalCustomers}
            value={data.totalCustomers}
            icon={<Users className="w-5 h-5" />}
            color="purple"
            trend={{ value: 5, label: "өмнөх сараас" }}
          />
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          {/* Revenue chart */}
          <Card className="xl:col-span-2">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-base font-semibold text-slate-800">Сарын орлого</h3>
                <p className="text-xs text-slate-400 mt-0.5">Сүүлийн 6 сарын мэдээлэл</p>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={data.monthlyData}>
                <defs>
                  <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} tickFormatter={(v) => `₮${(v / 1000).toFixed(0)}к`} />
                <Tooltip
                  formatter={(v: number) => [formatPrice(v), "Орлого"]}
                  contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }}
                />
                <Area type="monotone" dataKey="revenue" stroke="#2563eb" strokeWidth={2} fill="url(#revenueGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </Card>

          {/* Order status pie */}
          <Card>
            <div className="mb-4">
              <h3 className="text-base font-semibold text-slate-800">Захиалгын статус</h3>
              <p className="text-xs text-slate-400 mt-0.5">Нийт байдал</p>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={data.statusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {data.statusData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={STATUS_COLORS[index % STATUS_COLORS.length]} />
                  ))}
                </Pie>
                <Legend iconType="circle" iconSize={8} formatter={(v) => <span style={{ fontSize: 11, color: "#64748b" }}>{v}</span>} />
                <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        </div>

        {/* Recent orders + Low stock */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          {/* Recent orders */}
          <Card className="xl:col-span-2" padding="none">
            <div className="flex items-center justify-between p-5 pb-0">
              <div>
                <h3 className="text-base font-semibold text-slate-800">Сүүлийн захиалгууд</h3>
              </div>
              <Link
                href="/admin/orders"
                className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
              >
                Бүгдийг харах <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="px-5 py-2.5 text-left text-xs font-semibold text-slate-400 uppercase">Дугаар</th>
                    <th className="px-5 py-2.5 text-left text-xs font-semibold text-slate-400 uppercase">Харилцагч</th>
                    <th className="px-5 py-2.5 text-left text-xs font-semibold text-slate-400 uppercase">Статус</th>
                    <th className="px-5 py-2.5 text-left text-xs font-semibold text-slate-400 uppercase">Дүн</th>
                    <th className="px-5 py-2.5 text-left text-xs font-semibold text-slate-400 uppercase">Огноо</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {data.recentOrders.map((order: any) => (
                    <tr key={order.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-5 py-3">
                        <Link href={`/admin/orders/${order.id}`} className="font-medium text-blue-600 hover:underline">
                          {order.orderNumber}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-slate-700">{order.customer.name}</td>
                      <td className="px-5 py-3">
                        <Badge variant={orderStatusBadge(order.status)}>
                          {mn.status[order.status as keyof typeof mn.status]}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 font-medium text-slate-800">
                        {formatPrice(Number(order.total))}
                      </td>
                      <td className="px-5 py-3 text-slate-400 text-xs">{formatDate(order.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Low stock */}
          <Card>
            <div className="flex items-center gap-2 mb-4">
              <div className="p-2 bg-orange-100 rounded-xl">
                <AlertTriangle className="w-4 h-4 text-orange-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-800">Дуусч байгаа бараа</h3>
                <p className="text-xs text-slate-400">Нөөцийг нэмэх шаардлагатай</p>
              </div>
            </div>
            <div className="space-y-2.5">
              {data.lowStockProducts.length === 0 ? (
                <p className="text-sm text-slate-400 py-4 text-center">Бүх бараа хангалттай нөөцтэй</p>
              ) : (
                data.lowStockProducts.map((inv: any) => (
                  <div key={inv.id} className="flex items-center justify-between bg-orange-50 rounded-xl px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-700 truncate">{inv.product.name}</p>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <span className="text-sm font-bold text-orange-600">{inv.quantity}</span>
                      <p className="text-xs text-slate-400">/{inv.minStock}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
