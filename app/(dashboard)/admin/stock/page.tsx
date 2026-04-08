"use client";

import { Fragment, useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { ArrowRight, X } from "lucide-react";
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

interface DriverMovementCell {
  day: string;
  added: number;
  removed: number;
  balance: number;
}

interface DriverMovementRow {
  productId: string;
  productName: string;
  values: DriverMovementCell[];
}

function qtyClass(qty: number) {
  if (qty <= 0) return "text-red-600";
  if (qty < 10) return "text-orange-500";
  return "text-slate-700";
}

function getTodayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function displayDate(isoDate: string): string {
  return isoDate.replace(/-/g, ".");
}

export default function StockPage() {
  const { data: session } = useSession();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [rows, setRows] = useState<StockRow[]>([]);
  const [filtered, setFiltered] = useState<StockRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("ACTIVE");
  const [selectedDriverId, setSelectedDriverId] = useState("");
  const [movementModalOpen, setMovementModalOpen] = useState(false);
  const [movementFromDate, setMovementFromDate] = useState(getTodayLocal());
  const [movementToDate, setMovementToDate] = useState(getTodayLocal());
  const [movementRows, setMovementRows] = useState<DriverMovementRow[]>([]);
  const [movementDays, setMovementDays] = useState<string[]>([]);
  const [isMovementLoading, setIsMovementLoading] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" } | null>(null);
  const isOperator = String(session?.user?.role ?? "").toUpperCase() === "OPERATOR";
  const isAdmin = String(session?.user?.role ?? "").toUpperCase() === "ADMIN";

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
          const at = a.driverBreakdown[selectedDriverId] ?? 0;
          const bt = b.driverBreakdown[selectedDriverId] ?? 0;
          return sortConfig.direction === "asc" ? at - bt : bt - at;
        });
      } else if (sortConfig.key === "selectedDriverAvailable") {
        data.sort((a, b) => {
          const at = Math.max(0, (a.driverBreakdown[selectedDriverId] ?? 0) - (a.driverReservedBreakdown[selectedDriverId] ?? 0));
          const bt = Math.max(0, (b.driverBreakdown[selectedDriverId] ?? 0) - (b.driverReservedBreakdown[selectedDriverId] ?? 0));
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
        const driverCurrent = row.driverBreakdown[driver.id] ?? 0;
        base.driverTotals[driver.id] = (base.driverTotals[driver.id] ?? 0) + driverCurrent;
      }

      if (selectedDriverId) {
        const selectedCurrent = row.driverBreakdown[selectedDriverId] ?? 0;
        const selectedReserved = row.driverReservedBreakdown[selectedDriverId] ?? 0;
        base.selectedDriverTotal += selectedCurrent;
        base.selectedDriverReserved += selectedReserved;
        base.selectedDriverAvailable += Math.max(0, selectedCurrent - selectedReserved);
      }
    }

    return base;
  }, [drivers, filtered, selectedDriverId]);

  const selectedDriverName = useMemo(() => {
    if (!selectedDriverId) return "";
    return drivers.find((driver) => driver.id === selectedDriverId)?.name ?? "";
  }, [drivers, selectedDriverId]);

  const movementTotalsByDay = useMemo(() => {
    const totals: Record<string, { added: number; removed: number; balance: number }> = {};

    for (const day of movementDays) {
      totals[day] = { added: 0, removed: 0, balance: 0 };
    }

    for (const row of movementRows) {
      for (const cell of row.values) {
        if (!totals[cell.day]) {
          totals[cell.day] = { added: 0, removed: 0, balance: 0 };
        }
        totals[cell.day].added += cell.added;
        totals[cell.day].removed += cell.removed;
        totals[cell.day].balance += cell.balance;
      }
    }

    return totals;
  }, [movementDays, movementRows]);

  const fetchDriverMovement = useCallback(async () => {
    if (!selectedDriverId) return;

    setIsMovementLoading(true);
    try {
      const params = new URLSearchParams({
        driverId: selectedDriverId,
        fromDate: movementFromDate,
        toDate: movementToDate,
      });

      const res = await fetch(`/api/stock/driver-movements?${params.toString()}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error ?? "Дэлгэрэнгүй хүснэгт уншихад алдаа гарлаа");
      }

      setMovementDays(json.days ?? []);
      setMovementRows(json.rows ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Дэлгэрэнгүй хүснэгт уншихад алдаа гарлаа");
      setMovementDays([]);
      setMovementRows([]);
    } finally {
      setIsMovementLoading(false);
    }
  }, [movementFromDate, movementToDate, selectedDriverId]);

  useEffect(() => {
    if (!movementModalOpen || !selectedDriverId) return;
    fetchDriverMovement();
  }, [movementModalOpen, selectedDriverId, movementFromDate, movementToDate, fetchDriverMovement]);

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
            <option value="ALL">Бүх статус</option>
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
          {isAdmin && selectedDriverId && (
            <button
              type="button"
              onClick={() => setMovementModalOpen(true)}
              className="px-3 py-2 rounded-xl border border-blue-200 bg-blue-50 text-sm font-medium text-blue-700 hover:bg-blue-100"
            >
              Дэлгэрэнгүй хөдөлгөөн
            </button>
          )}
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
            <div className="max-h-[75vh] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-20">
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
                      const selectedDriverTotal = selectedDriverCurrent;
                      const selectedDriverAvailable = Math.max(0, selectedDriverCurrent - selectedDriverReserved);
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
                                const currentQty = row.driverBreakdown[d.id] ?? 0;
                                return (
                                  <td key={d.id} className={`px-4 py-1.5 text-center text-sm font-medium bg-orange-50/20 ${qtyClass(currentQty)}`}>
                                    {currentQty}
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

      {movementModalOpen && selectedDriverId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-3" onClick={() => setMovementModalOpen(false)}>
          <div
            className="w-full max-w-[96vw] max-h-[92vh] overflow-hidden rounded-xl border border-slate-300 bg-white shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-800">Жолоочийн дэлгэрэнгүй хөдөлгөөн</h3>
                <p className="text-xs text-slate-500">Жолооч: {selectedDriverName || "-"}</p>
              </div>
              <button
                type="button"
                onClick={() => setMovementModalOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 hover:bg-slate-100"
                title="Хаах"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="border-b border-slate-200 px-4 py-3">
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1 text-xs text-slate-600">
                  Эхлэх огноо
                  <input
                    type="date"
                    value={movementFromDate}
                    onChange={(e) => setMovementFromDate(e.target.value)}
                    className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-slate-600">
                  Дуусах огноо
                  <input
                    type="date"
                    value={movementToDate}
                    onChange={(e) => setMovementToDate(e.target.value)}
                    className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </label>
                <button
                  type="button"
                  onClick={fetchDriverMovement}
                  className="rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
                >
                  Шинэчлэх
                </button>
                <span className="text-xs text-slate-500">Тухайн өдрийн 00:00-23:59 хөдөлгөөнөөр тооцно.</span>
              </div>
            </div>

            <div className="max-h-[calc(92vh-150px)] overflow-auto">
              {isMovementLoading ? (
                <div className="p-10 text-center text-sm text-slate-400">Ачааллаж байна...</div>
              ) : movementRows.length === 0 ? (
                <div className="p-10 text-center text-sm text-slate-400">Хөдөлгөөний мэдээлэл алга</div>
              ) : (
                <table className="min-w-[1000px] w-full border-collapse text-xs">
                  <thead className="sticky top-0 z-20 bg-slate-100">
                    <tr>
                      <th rowSpan={2} className="sticky left-0 z-30 border border-slate-300 bg-slate-100 px-3 py-2 text-left text-[11px] font-semibold uppercase text-slate-600 min-w-[220px]">
                        Бараа
                      </th>
                      {movementDays.map((day) => (
                        <th key={day} colSpan={3} className="border border-slate-300 px-2 py-2 text-center text-[11px] font-semibold text-slate-700">
                          {displayDate(day)}
                        </th>
                      ))}
                    </tr>
                    <tr>
                      {movementDays.map((day) => (
                        <Fragment key={day}>
                          <th key={`${day}-added`} className="border border-slate-300 bg-emerald-50 px-2 py-1 text-center font-semibold text-emerald-700">Нэмэгдсэн</th>
                          <th key={`${day}-removed`} className="border border-slate-300 bg-red-50 px-2 py-1 text-center font-semibold text-red-700">Хасагдсан</th>
                          <th key={`${day}-balance`} className="border border-slate-300 bg-slate-50 px-2 py-1 text-center font-semibold text-slate-700">Үлдэгдэл</th>
                        </Fragment>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {movementRows.map((row, rowIndex) => (
                      <tr key={row.productId} className={rowIndex % 2 === 0 ? "bg-white" : "bg-slate-50/40"}>
                        <td className="sticky left-0 z-10 border border-slate-300 bg-inherit px-3 py-1.5 text-sm text-slate-800 whitespace-nowrap">
                          {row.productName}
                        </td>
                        {row.values.map((cell) => (
                          <Fragment key={`${row.productId}-${cell.day}`}>
                            <td key={`${row.productId}-${cell.day}-a`} className="border border-slate-300 px-2 py-1 text-center text-emerald-700">{cell.added || ""}</td>
                            <td key={`${row.productId}-${cell.day}-r`} className="border border-slate-300 px-2 py-1 text-center text-red-700">{cell.removed || ""}</td>
                            <td key={`${row.productId}-${cell.day}-b`} className="border border-slate-300 px-2 py-1 text-center text-slate-700">{cell.balance}</td>
                          </Fragment>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-400 bg-slate-100/90">
                      <td className="sticky left-0 z-10 border border-slate-300 bg-slate-100/90 px-3 py-1.5 text-sm font-semibold text-slate-800 whitespace-nowrap">
                        Нийт
                      </td>
                      {movementDays.map((day) => (
                        <Fragment key={`total-${day}`}>
                          <td className="border border-slate-300 px-2 py-1 text-center font-semibold text-emerald-700">
                            {movementTotalsByDay[day]?.added ?? 0}
                          </td>
                          <td className="border border-slate-300 px-2 py-1 text-center font-semibold text-red-700">
                            {movementTotalsByDay[day]?.removed ?? 0}
                          </td>
                          <td className="border border-slate-300 px-2 py-1 text-center font-semibold text-slate-800">
                            {movementTotalsByDay[day]?.balance ?? 0}
                          </td>
                        </Fragment>
                      ))}
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
