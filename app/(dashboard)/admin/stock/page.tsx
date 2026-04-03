"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Search, ArrowRight } from "lucide-react";
import Header from "@/components/layout/Header";
import { Card } from "@/components/ui/Card";
import toast from "react-hot-toast";

interface Driver {
  id: string;
  name: string;
}

interface StockRow {
  id: string;
  name: string;
  category: string | null;
  images: { url: string; isPrimary: boolean }[];
  warehouseQty: number;
  driverBreakdown: Record<string, number>;
  totalDriverQty: number;
  totalDelivered: number;
  totalRemaining: number;
}

function qtyClass(qty: number) {
  if (qty <= 0) return "text-red-600 font-semibold";
  if (qty < 10) return "text-orange-500 font-semibold";
  return "text-slate-700";
}

export default function StockPage() {
  const { data: session } = useSession();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [rows, setRows] = useState<StockRow[]>([]);
  const [filtered, setFiltered] = useState<StockRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [stockFilter, setStockFilter] = useState("");
  const isOperator = String(session?.user?.role ?? "").toUpperCase() === "OPERATOR";

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/stock");
      if (!res.ok) throw new Error("Failed");
      const json = await res.json();
      setDrivers(json.drivers ?? []);
      setRows(json.rows ?? []);
    } catch {
      toast.error("Үлдэгдэл уншихад алдаа гарлаа");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    let data = [...rows];
    if (search) {
      const q = search.toLowerCase();
      data = data.filter(
        (r) => r.name.toLowerCase().includes(q) || r.category?.toLowerCase().includes(q)
      );
    }
    if (stockFilter === "out") data = data.filter((r) => r.totalRemaining <= 0);
    else if (stockFilter === "low") data = data.filter((r) => r.totalRemaining > 0 && r.warehouseQty < 10);
    setFiltered(data);
  }, [rows, search, stockFilter]);

  return (
    <div>
      <Header title="Барааны үлдэгдэл" subtitle="Агуулах болон жолоочдын нөөцийн мэдээлэл" />

      <div className="p-5 space-y-4">
        {/* Filter bar */}
        <div className="flex flex-col sm:flex-row gap-3 items-center">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Нэр хайх..."
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 bg-white text-sm
                placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <select
            value={stockFilter}
            onChange={(e) => setStockFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-700
              focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Бүх нөөц</option>
            <option value="out">Дуссан (0)</option>
            <option value="low">Агуулах бага (&lt; 10)</option>
          </select>
          <span className="text-sm text-slate-400 ml-auto">{filtered.length} бараа</span>
        </div>

        {/* Table */}
        <Card padding="none">
          {isLoading ? (
            <div className="p-12 text-center">
              <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-sm text-slate-400 mt-3">Ачааллаж байна...</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase w-10">#</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase min-w-[220px]">Бараа</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-blue-500 uppercase bg-blue-50/60">Агуулах</th>
                    {drivers.map((d) => (
                      <th
                        key={d.id}
                        className="px-4 py-3 text-center text-xs font-semibold text-orange-500 uppercase bg-orange-50/50 whitespace-nowrap"
                      >
                        {d.name}
                      </th>
                    ))}
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase">Нийт үлдэгдэл</th>
                    {!isOperator && (
                      <th className="px-4 py-3 text-center text-xs font-semibold text-emerald-600 uppercase bg-emerald-50/50">Хүргэгдсэн</th>
                    )}
                    {!isOperator && (
                      <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400 uppercase"></th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={(isOperator ? 4 : 6) + drivers.length} className="py-14 text-center text-sm text-slate-400">
                        Бараа олдсонгүй
                      </td>
                    </tr>
                  ) : (
                    filtered.map((row, index) => {
                      return (
                        <tr key={row.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-4 py-3 text-center text-sm text-slate-400">{index + 1}</td>
                          <td className="px-4 py-3 font-medium text-slate-800">{row.name}</td>
                          <td className={`px-4 py-3 text-center bg-blue-50/30 text-base ${qtyClass(row.warehouseQty)}`}>
                            {row.warehouseQty}
                          </td>
                          {drivers.map((d) => {
                            const qty = row.driverBreakdown[d.id] ?? 0;
                            return (
                              <td key={d.id} className={`px-4 py-3 text-center bg-orange-50/20 ${qtyClass(qty)}`}>
                                {qty}
                              </td>
                            );
                          })}
                          <td className="px-4 py-3 text-center font-bold text-slate-800 text-base">
                            {row.totalRemaining}
                          </td>
                          {!isOperator && (
                            <td className="px-4 py-3 text-center text-emerald-600 font-semibold bg-emerald-50/20">
                              {row.totalDelivered}
                            </td>
                          )}
                          {!isOperator && (
                            <td className="px-4 py-3">
                              <div className="flex justify-end">
                                <Link href={`/admin/products/${row.id}`}>
                                  <button className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors text-xs font-medium whitespace-nowrap">
                                    Тохируулах
                                    <ArrowRight className="w-3.5 h-3.5" />
                                  </button>
                                </Link>
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
