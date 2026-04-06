"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { ArrowRight } from "lucide-react";
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
  status: string;
  category: string | null;
  images: { url: string; isPrimary: boolean }[];
  warehouseQty: number;
  driverBreakdown: Record<string, number>;
  driverReservedBreakdown: Record<string, number>;
  totalDriverQty: number;
  totalDelivered: number;
  totalRemaining: number;
}

function qtyClass(qty: number) {
  if (qty <= 0) return "text-red-600";
  if (qty < 10) return "text-orange-500";
  return "text-slate-700";
}

export default function StockPage() {
  const { data: session } = useSession();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [rows, setRows] = useState<StockRow[]>([]);
  const [filtered, setFiltered] = useState<StockRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("ACTIVE");
  const [selectedDriverId, setSelectedDriverId] = useState("");
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" } | null>(null);
  const isOperator = String(session?.user?.role ?? "").toUpperCase() === "OPERATOR";

  const toggleSort = useCallback((key: string, initialDirection: "asc" | "desc") => {
    setSortConfig((current) => {
      if (!current || current.key !== key) {
        return { key, direction: initialDirection };
      }

      return {
        key,
        direction: current.direction === "asc" ? "desc" : "asc",
      };
    });
  }, []);

  const getSortIndicator = useCallback((key: string) => {
    if (!sortConfig || sortConfig.key !== key) return "";
    return sortConfig.direction === "asc" ? " ↑" : " ↓";
  }, [sortConfig]);

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
    if (statusFilter === "ACTIVE") data = data.filter((r) => r.status === "ACTIVE");
    else if (statusFilter === "DRAFT") data = data.filter((r) => r.status === "DRAFT");

    if (sortConfig) {
      if (sortConfig.key === "name") {
        data.sort((a, b) => {
          const cmp = a.name.localeCompare(b.name, "mn", { sensitivity: "base" });
          return sortConfig.direction === "asc" ? cmp : -cmp;
        });
      } else if (sortConfig.key === "warehouse") {
        data.sort((a, b) => {
          return sortConfig.direction === "asc" ? a.warehouseQty - b.warehouseQty : b.warehouseQty - a.warehouseQty;
        });
      } else if (sortConfig.key.startsWith("driver:")) {
        const driverId = sortConfig.key.slice("driver:".length);
        data.sort((a, b) => {
          const av = a.driverBreakdown[driverId] ?? 0;
          const bv = b.driverBreakdown[driverId] ?? 0;
          return sortConfig.direction === "asc" ? av - bv : bv - av;
        });
      } else if (sortConfig.key === "deliveryInProgress") {
        data.sort((a, b) => {
          const av = Object.values(a.driverReservedBreakdown).reduce((sum, qty) => sum + qty, 0);
          const bv = Object.values(b.driverReservedBreakdown).reduce((sum, qty) => sum + qty, 0);
          return sortConfig.direction === "asc" ? av - bv : bv - av;
        });
      } else if (sortConfig.key === "totalRemaining") {
        data.sort((a, b) => {
          return sortConfig.direction === "asc" ? a.totalRemaining - b.totalRemaining : b.totalRemaining - a.totalRemaining;
        });
      } else if (sortConfig.key === "delivered") {
        data.sort((a, b) => {
          return sortConfig.direction === "asc" ? a.totalDelivered - b.totalDelivered : b.totalDelivered - a.totalDelivered;
        });
      } else if (sortConfig.key === "selectedDriverTotal") {
        data.sort((a, b) => {
          const at = (a.driverBreakdown[selectedDriverId] ?? 0) + (a.driverReservedBreakdown[selectedDriverId] ?? 0);
          const bt = (b.driverBreakdown[selectedDriverId] ?? 0) + (b.driverReservedBreakdown[selectedDriverId] ?? 0);
          return sortConfig.direction === "asc" ? at - bt : bt - at;
        });
      } else if (sortConfig.key === "selectedDriverAvailable") {
        data.sort((a, b) => {
          const at = a.driverBreakdown[selectedDriverId] ?? 0;
          const bt = b.driverBreakdown[selectedDriverId] ?? 0;
          return sortConfig.direction === "asc" ? at - bt : bt - at;
        });
      } else if (sortConfig.key === "selectedDriverReserved") {
        data.sort((a, b) => {
          const ar = a.driverReservedBreakdown[selectedDriverId] ?? 0;
          const br = b.driverReservedBreakdown[selectedDriverId] ?? 0;
          return sortConfig.direction === "asc" ? ar - br : br - ar;
        });
      }
    }

    setFiltered(data);
  }, [rows, selectedDriverId, statusFilter, sortConfig]);

  const totals = useMemo(() => {
    const base = {
      warehouse: 0,
      deliveryInProgress: 0,
      totalRemaining: 0,
      delivered: 0,
      driverTotals: {} as Record<string, number>,
      selectedDriverTotal: 0,
      selectedDriverAvailable: 0,
      selectedDriverReserved: 0,
    };

    for (const row of filtered) {
      const rowReserved = Object.values(row.driverReservedBreakdown).reduce((sum, qty) => sum + qty, 0);
      base.warehouse += row.warehouseQty;
      base.deliveryInProgress += rowReserved;
      base.totalRemaining += row.totalRemaining;
      base.delivered += row.totalDelivered;

      for (const driver of drivers) {
        base.driverTotals[driver.id] = (base.driverTotals[driver.id] ?? 0) + (row.driverBreakdown[driver.id] ?? 0);
      }

      if (selectedDriverId) {
        const selectedCurrent = row.driverBreakdown[selectedDriverId] ?? 0;
        const selectedReserved = row.driverReservedBreakdown[selectedDriverId] ?? 0;
        const selectedTotal = selectedCurrent + selectedReserved;
        base.selectedDriverTotal += selectedTotal;
        base.selectedDriverReserved += selectedReserved;
        base.selectedDriverAvailable += Math.max(0, selectedTotal - selectedReserved);
      }
    }

    return base;
  }, [drivers, filtered, selectedDriverId]);

  return (
    <div>
      <Header title="Барааны үлдэгдэл" subtitle="Агуулах болон жолоочдын нөөцийн мэдээлэл" />

      <div className="p-5 space-y-4">
        {/* Filter bar */}
        <div className="flex flex-col sm:flex-row gap-3 items-center">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-700
              focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="ACTIVE">Идэвхтэй</option>
            <option value="DRAFT">Идэвхгүй</option>
          </select>
          <select
            value={selectedDriverId}
            onChange={(e) => setSelectedDriverId(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-700
              focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Бүх жолооч</option>
            {drivers.map((driver) => (
              <option key={driver.id} value={driver.id}>{driver.name}</option>
            ))}
          </select>
          <span className="text-sm text-slate-400 sm:ml-auto">{filtered.length} бараа</span>
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
                    <th className="px-4 py-2 text-center text-xs font-semibold text-slate-400 uppercase w-10">#</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-slate-400 uppercase min-w-[220px]">
                      <button
                        type="button"
                        onClick={() => toggleSort("name", "asc")}
                        className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-left text-xs font-semibold uppercase text-slate-500 hover:bg-slate-200/70"
                      >
                        Бараа{getSortIndicator("name")}
                      </button>
                    </th>
                    {selectedDriverId ? (
                      <>
                        <th className="px-4 py-2 text-center text-xs font-semibold text-blue-500 uppercase bg-blue-50/60">
                          <button
                            type="button"
                            onClick={() => toggleSort("selectedDriverTotal", "desc")}
                            className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-xs font-semibold uppercase text-blue-500 hover:bg-blue-100/80"
                          >
                            Нийт үлдэгдэл{getSortIndicator("selectedDriverTotal")}
                          </button>
                        </th>
                        <th className="px-4 py-2 text-center text-xs font-semibold text-emerald-600 uppercase bg-emerald-50/50">
                          <button
                            type="button"
                            onClick={() => toggleSort("selectedDriverAvailable", "desc")}
                            className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-xs font-semibold uppercase text-emerald-600 hover:bg-emerald-100/80"
                          >
                            Нэмж авах боломжтой{getSortIndicator("selectedDriverAvailable")}
                          </button>
                        </th>
                        <th className="px-4 py-2 text-center text-xs font-semibold text-orange-600 uppercase bg-orange-50/50">
                          <button
                            type="button"
                            onClick={() => toggleSort("selectedDriverReserved", "desc")}
                            className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-xs font-semibold uppercase text-orange-600 hover:bg-orange-100/80"
                          >
                            Хуваарилсан{getSortIndicator("selectedDriverReserved")}
                          </button>
                        </th>
                      </>
                    ) : (
                      <>
                        <th className="px-4 py-2 text-center text-xs font-semibold text-blue-500 uppercase bg-blue-50/60">
                          <button
                            type="button"
                            onClick={() => toggleSort("warehouse", "desc")}
                            className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-xs font-semibold uppercase text-blue-500 hover:bg-blue-100/80"
                          >
                            Агуулах{getSortIndicator("warehouse")}
                          </button>
                        </th>
                        {drivers.map((d) => (
                          <th
                            key={d.id}
                            className="px-4 py-2 text-center text-xs font-semibold text-slate-700 uppercase bg-orange-50/50 whitespace-nowrap"
                          >
                            <button
                              type="button"
                              onClick={() => toggleSort(`driver:${d.id}`, "desc")}
                              className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-xs font-semibold uppercase text-slate-700 hover:bg-orange-100/80"
                            >
                              {d.name}{getSortIndicator(`driver:${d.id}`)}
                            </button>
                          </th>
                        ))}
                        <th className="px-4 py-2 text-center text-xs font-semibold text-amber-600 uppercase bg-amber-50/50">
                          <button
                            type="button"
                            onClick={() => toggleSort("deliveryInProgress", "desc")}
                            className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-xs font-semibold uppercase text-amber-600 hover:bg-amber-100/80"
                          >
                            Хүргэлтэд{getSortIndicator("deliveryInProgress")}
                          </button>
                        </th>
                        <th className="px-4 py-2 text-center text-xs font-semibold text-slate-500 uppercase">
                          <button
                            type="button"
                            onClick={() => toggleSort("totalRemaining", "desc")}
                            className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-xs font-semibold uppercase text-slate-500 hover:bg-slate-200/70"
                          >
                            Нийт үлдэгдэл{getSortIndicator("totalRemaining")}
                          </button>
                        </th>
                      </>
                    )}
                    {!isOperator && !selectedDriverId && (
                      <th className="px-4 py-2 text-center text-xs font-semibold text-emerald-600 uppercase bg-emerald-50/50">
                        <button
                          type="button"
                          onClick={() => toggleSort("delivered", "desc")}
                          className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-xs font-semibold uppercase text-emerald-600 hover:bg-emerald-100/80"
                        >
                          Хүргэгдсэн{getSortIndicator("delivered")}
                        </button>
                      </th>
                    )}
                    {!isOperator && (
                      <th className="px-4 py-2 text-right text-xs font-semibold text-slate-400 uppercase"></th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={selectedDriverId ? (isOperator ? 5 : 6) : (isOperator ? 5 : 7) + drivers.length} className="py-14 text-center text-sm text-slate-400">
                        Бараа олдсонгүй
                      </td>
                    </tr>
                  ) : (
                    <>
                    {filtered.map((row, index) => {
                      const selectedDriverCurrent = selectedDriverId ? (row.driverBreakdown[selectedDriverId] ?? 0) : 0;
                      const selectedDriverReserved = selectedDriverId ? (row.driverReservedBreakdown[selectedDriverId] ?? 0) : 0;
                      const selectedDriverTotal = selectedDriverCurrent + selectedDriverReserved;
                      const selectedDriverAvailable = Math.max(0, selectedDriverTotal - selectedDriverReserved);
                      const rowDeliveryInProgress = Object.values(row.driverReservedBreakdown).reduce((sum, qty) => sum + qty, 0);

                      return (
                        <tr key={row.id} className={`transition-colors ${index % 2 === 0 ? "bg-white" : "bg-slate-50/40"} hover:bg-blue-100/70`}>
                          <td className="px-4 py-1.5 text-center text-sm text-slate-400">{index + 1}</td>
                          <td className="px-4 py-1.5 font-medium text-slate-800">{row.name}</td>
                          {selectedDriverId ? (
                            <>
                              <td className={`px-4 py-1.5 text-center bg-blue-50/30 text-sm font-medium ${qtyClass(selectedDriverTotal)}`}>
                                {selectedDriverTotal}
                              </td>
                              <td className={`px-4 py-1.5 text-center bg-emerald-50/30 text-sm font-medium ${qtyClass(selectedDriverAvailable)}`}>
                                {selectedDriverAvailable}
                              </td>
                              <td className={`px-4 py-1.5 text-center bg-orange-50/30 text-sm font-medium ${qtyClass(selectedDriverReserved)}`}>
                                {selectedDriverReserved}
                              </td>
                            </>
                          ) : (
                            <>
                              <td className={`px-4 py-1.5 text-center bg-blue-50/30 text-sm font-medium ${qtyClass(row.warehouseQty)}`}>
                                {row.warehouseQty}
                              </td>
                              {drivers.map((d) => {
                                const qty = row.driverBreakdown[d.id] ?? 0;
                                return (
                                  <td key={d.id} className={`px-4 py-1.5 text-center text-sm font-medium bg-orange-50/20 ${qtyClass(qty)}`}>
                                    {qty}
                                  </td>
                                );
                              })}
                              <td className={`px-4 py-1.5 text-center bg-amber-50/40 text-sm font-medium ${qtyClass(rowDeliveryInProgress)}`}>
                                {rowDeliveryInProgress}
                              </td>
                              <td className={`px-4 py-1.5 text-center text-sm font-bold ${qtyClass(row.totalRemaining)}`}>
                                {row.totalRemaining}
                              </td>
                            </>
                          )}
                          {!isOperator && !selectedDriverId && (
                            <td className="px-4 py-1.5 text-center text-sm text-emerald-600 font-medium bg-emerald-50/20">
                              {row.totalDelivered}
                            </td>
                          )}
                          {!isOperator && (
                            <td className="px-4 py-1.5">
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
                    })}

                    <tr className="border-t-2 border-slate-200 bg-slate-100/80">
                      <td className="px-4 py-2.5 text-center text-slate-500">-</td>
                      <td className="px-4 py-2.5 text-sm text-slate-800">Нийт</td>
                      {selectedDriverId ? (
                        <>
                          <td className={`px-4 py-2.5 text-center text-sm font-medium ${qtyClass(totals.selectedDriverTotal)}`}>{totals.selectedDriverTotal}</td>
                          <td className={`px-4 py-2.5 text-center text-sm font-medium ${qtyClass(totals.selectedDriverAvailable)}`}>{totals.selectedDriverAvailable}</td>
                          <td className={`px-4 py-2.5 text-center text-sm font-medium ${qtyClass(totals.selectedDriverReserved)}`}>{totals.selectedDriverReserved}</td>
                        </>
                      ) : (
                        <>
                          <td className={`px-4 py-2.5 text-center text-sm font-medium ${qtyClass(totals.warehouse)}`}>{totals.warehouse}</td>
                          {drivers.map((d) => (
                            <td key={d.id} className={`px-4 py-2.5 text-center text-sm font-medium ${qtyClass(totals.driverTotals[d.id] ?? 0)}`}>
                              {totals.driverTotals[d.id] ?? 0}
                            </td>
                          ))}
                          <td className={`px-4 py-2.5 text-center text-sm font-medium ${qtyClass(totals.deliveryInProgress)}`}>{totals.deliveryInProgress}</td>
                          <td className={`px-4 py-2.5 text-center text-sm font-bold ${qtyClass(totals.totalRemaining)}`}>{totals.totalRemaining}</td>
                        </>
                      )}
                      {!isOperator && !selectedDriverId && (
                        <td className={`px-4 py-2.5 text-center text-sm font-medium ${qtyClass(totals.delivered)}`}>{totals.delivered}</td>
                      )}
                      {!isOperator && <td className="px-4 py-2.5"></td>}
                    </tr>
                    </>
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
