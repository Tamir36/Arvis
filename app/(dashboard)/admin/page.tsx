"use client";

import { useEffect, useState } from "react";
import { formatPrice, formatDate } from "@/lib/utils";
import { Card } from "@/components/ui/Card";
import StatsCard from "@/components/ui/StatsCard";
import Header from "@/components/layout/Header";
import Button from "@/components/ui/Button";
import {
  ShoppingCart,
  Package,
  Users,
  TrendingUp,
  AlertTriangle,
  Download,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
} from "recharts";
import { mn } from "@/locales/mn";

interface DashboardData {
  totalOrders: number;
  totalProducts: number;
  totalCustomers: number;
  totalRevenue: number;
  lowStockProducts: any[];
  monthlyData: Array<{ day: string; revenue: number; totalOrders: number }>;
  statusData: Array<{
    day: string;
    BLANK: number;
    PENDING: number;
    CONFIRMED: number;
    DELIVERED: number;
    CANCELLED: number;
    RETURNED: number;
    BLANKAmount: number;
    PENDINGAmount: number;
    CONFIRMEDAmount: number;
    DELIVEREDAmount: number;
    CANCELLEDAmount: number;
    RETURNEDAmount: number;
  }>;
  selectedYear: number;
  selectedMonth: number;
}

type ProductStatusKey = "DELIVERED" | "CONFIRMED" | "RETURNED" | "BLANK" | "PENDING" | "CANCELLED";

type ProductStatusSummaryRow = {
  productName: string;
  DELIVERED: number;
  CONFIRMED: number;
  RETURNED: number;
  BLANK: number;
  PENDING: number;
  CANCELLED: number;
  total: number;
};

const STATUS_META = [
  { key: "BLANK", color: "#94a3b8", label: "Blank" },
  { key: "PENDING", color: "#2563eb", label: "Хүлээлгэ" },
  { key: "CONFIRMED", color: "#f97316", label: "Хуваарилсан" },
  { key: "DELIVERED", color: "#10b981", label: "Хүргэгдсэн" },
  { key: "CANCELLED", color: "#ef4444", label: "Цуцалсан" },
  { key: "RETURNED", color: "#6b7280", label: "Хойшлуулсан" },
] as const;

export default function AdminDashboard() {
  const now = new Date();
  const todayString = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth() + 1);
  const [data, setData] = useState<DashboardData | null>(null);
  const [reportFromDate, setReportFromDate] = useState(todayString);
  const [reportToDate, setReportToDate] = useState(todayString);
  const [productStatusRows, setProductStatusRows] = useState<ProductStatusSummaryRow[]>([]);
  const [productStatusLoading, setProductStatusLoading] = useState(false);
  const [isExportingProductReport, setIsExportingProductReport] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleExportProductStatusReport = () => {
    if (productStatusRows.length === 0) return;

    setIsExportingProductReport(true);
    try {
      const escapeCsv = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
      const header = [
        "Бараа",
        "Хүргэгдсэн",
        "Хуваарилсан",
        "Хойшлуулсан",
        "Blank",
        "Хүлээгдэж байгаа",
        "Цуцалсан",
        "Нийлбэр",
      ];

      const rows = productStatusRows.map((row) => [
        row.productName,
        row.DELIVERED,
        row.CONFIRMED,
        row.RETURNED,
        row.BLANK,
        row.PENDING,
        row.CANCELLED,
        row.total,
      ]);

      const csvContent = [header, ...rows]
        .map((line) => line.map((cell) => escapeCsv(cell)).join(","))
        .join("\n");

      const blob = new Blob([`\uFEFF${csvContent}`], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const safeFromDate = reportFromDate || "from";
      const safeToDate = reportToDate || "to";
      link.href = url;
      link.download = `baraanii-tailan-${safeFromDate}-${safeToDate}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } finally {
      setIsExportingProductReport(false);
    }
  };

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const response = await fetch(`/api/dashboard/stats?year=${selectedYear}&month=${selectedMonth}`);
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
  }, [selectedYear, selectedMonth]);

  useEffect(() => {
    const fetchProductStatusReport = async () => {
      setProductStatusLoading(true);
      try {
        const params = new URLSearchParams({
          reportMode: "product-status",
          fromDate: reportFromDate,
          toDate: reportToDate,
        });

        const response = await fetch(`/api/orders?${params.toString()}`);
        if (!response.ok) {
          throw new Error("Failed to fetch product status report");
        }

        const json = await response.json();
        const rows = Array.isArray(json.data) ? json.data : [];
        setProductStatusRows(rows as ProductStatusSummaryRow[]);
      } catch {
        setProductStatusRows([]);
      } finally {
        setProductStatusLoading(false);
      }
    };

    void fetchProductStatusReport();
  }, [reportFromDate, reportToDate]);

  if (loading) {
    return (
      <div>
        <Header title="Хянах самбар" subtitle="Захиалгын ерөнхий мэдээлэл" showSearch={false} />
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
        <Header title="Хянах самбар" subtitle="Захиалгын ерөнхий мэдээлэл" showSearch={false} />
        <div className="p-5">
          <Card className="bg-red-50 border-red-200">
            <p className="text-red-800 font-medium">❌ Алдаа: {error || "Өгөгдөл ачаалж чадсан"}</p>
          </Card>
        </div>
      </div>
    );
  }

  const selectedMonthRevenueTotal = data.monthlyData.reduce((sum, row) => {
    const revenue = Number(row.revenue ?? 0);
    return Number.isFinite(revenue) ? sum + revenue : sum;
  }, 0);

  const selectedMonthDeliveredCount = data.statusData.reduce((sum, row) => {
    const delivered = Number(row.DELIVERED ?? 0);
    return Number.isFinite(delivered) ? sum + delivered : sum;
  }, 0);

  return (
    <div>
      <Header title="Хянах самбар" subtitle="Захиалгын ерөнхий мэдээлэл" showSearch={false} />

      <div className="p-5 space-y-5">
        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatsCard
            title={mn.stats.totalRevenue}
            value={formatPrice(selectedMonthRevenueTotal)}
            icon={<TrendingUp className="w-5 h-5" />}
            color="orange"
          />
          <StatsCard
            title={mn.stats.totalOrders}
            value={selectedMonthDeliveredCount}
            icon={<ShoppingCart className="w-5 h-5" />}
            color="blue"
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
                <h3 className="text-base font-semibold text-slate-800">Сарын орлого (өдөр өдрөөр)</h3>
                <p className="text-xs text-slate-400 mt-0.5">Хүргэгдсэн төлөвтэй захиалгын дүн</p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={2020}
                  max={2100}
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value) || now.getFullYear())}
                  className="h-8 w-24 rounded-lg border border-slate-200 px-2 text-sm text-slate-700"
                />
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(Number(e.target.value))}
                  className="h-8 w-28 rounded-lg border border-slate-200 px-2 text-sm text-slate-700"
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
                    <option key={month} value={month}>{month}-р сар</option>
                  ))}
                </select>
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
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
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
              <h3 className="text-base font-semibold text-slate-800">Захиалгын статус (өдөр өдрөөр)</h3>
              <p className="text-xs text-slate-400 mt-0.5">Тухайн өдрийн нийт захиалга</p>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.statusData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} allowDecimals={false} />
                {STATUS_META.map((status) => (
                  <Bar key={status.key} dataKey={status.key} stackId="status" fill={status.color} name={status.label} />
                ))}
                <Legend iconType="circle" iconSize={8} formatter={(v) => <span style={{ fontSize: 11, color: "#64748b" }}>{v}</span>} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }}
                  formatter={(value: number, name: string, item) => {
                    const row = item?.payload as Record<string, number | string> | undefined;
                    const statusMeta = STATUS_META.find((status) => status.label === name);
                    const statusKey = statusMeta?.key ?? String(item?.dataKey ?? "");
                    const amount = Number(row?.[`${statusKey}Amount`] ?? 0);
                    return [`${value} (${formatPrice(amount)})`, name];
                  }}
                />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>

        {/* Product status report + Low stock */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          {/* Product status report */}
          <Card className="xl:col-span-2" padding="none">
            <div className="p-5 pb-0">
              <div>
                <h3 className="text-base font-semibold text-slate-800">Барааны тайлан (статус тус бүр)</h3>
                <p className="mt-0.5 text-xs text-slate-400">Сонгосон огнооны хүрээнд бараа тус бүрийн төлөвийн тоо</p>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  value={reportFromDate}
                  onChange={(e) => setReportFromDate(e.target.value)}
                  className="h-9 rounded-lg border border-slate-200 px-2 text-sm text-slate-700"
                />
                <span className="text-slate-400">-</span>
                <input
                  type="date"
                  value={reportToDate}
                  onChange={(e) => setReportToDate(e.target.value)}
                  className="h-9 rounded-lg border border-slate-200 px-2 text-sm text-slate-700"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9"
                  leftIcon={<Download className="w-4 h-4" />}
                  onClick={handleExportProductStatusReport}
                  disabled={productStatusLoading || productStatusRows.length === 0 || isExportingProductReport}
                  isLoading={isExportingProductReport}
                >
                  Excel татах
                </Button>
              </div>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="px-5 py-2.5 text-left text-xs font-semibold text-slate-400 uppercase">Бараа</th>
                    <th className="px-3 py-2.5 text-center text-xs font-semibold text-slate-400 uppercase">Хүргэгдсэн</th>
                    <th className="px-3 py-2.5 text-center text-xs font-semibold text-slate-400 uppercase">Хуваарилсан</th>
                    <th className="px-3 py-2.5 text-center text-xs font-semibold text-slate-400 uppercase">Хойшлуулсан</th>
                    <th className="px-3 py-2.5 text-center text-xs font-semibold text-slate-400 uppercase">Blank</th>
                    <th className="px-3 py-2.5 text-center text-xs font-semibold text-slate-400 uppercase">Хүлээгдэж байгаа</th>
                    <th className="px-3 py-2.5 text-center text-xs font-semibold text-slate-400 uppercase">Цуцалсан</th>
                    <th className="px-3 py-2.5 text-center text-xs font-semibold text-slate-400 uppercase">Нийлбэр</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {productStatusLoading ? (
                    <tr>
                      <td colSpan={8} className="px-5 py-8 text-center text-sm text-slate-400">Тайлан ачаалж байна...</td>
                    </tr>
                  ) : productStatusRows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-5 py-8 text-center text-sm text-slate-400">Сонгосон хугацаанд өгөгдөл олдсонгүй</td>
                    </tr>
                  ) : (
                    productStatusRows.map((row) => (
                      <tr key={row.productName} className="transition-colors hover:bg-slate-50/50">
                        <td className="px-5 py-3 text-slate-700">{row.productName}</td>
                        <td className="px-3 py-3 text-center font-medium text-emerald-700">{row.DELIVERED}</td>
                        <td className="px-3 py-3 text-center font-medium text-orange-700">{row.CONFIRMED}</td>
                        <td className="px-3 py-3 text-center font-medium text-rose-700">{row.RETURNED}</td>
                        <td className="px-3 py-3 text-center font-medium text-slate-600">{row.BLANK}</td>
                        <td className="px-3 py-3 text-center font-medium text-blue-700">{row.PENDING}</td>
                        <td className="px-3 py-3 text-center font-medium text-slate-700">{row.CANCELLED}</td>
                        <td className="px-3 py-3 text-center font-semibold text-slate-900">{row.total}</td>
                      </tr>
                    ))
                  )}
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
