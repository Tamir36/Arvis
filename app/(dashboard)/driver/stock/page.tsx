"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Header from "@/components/layout/Header";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";

interface StockRow {
  id: string;
  quantity: number;
  product: {
    id: string;
    name: string;
  };
}

interface StockMovementRow {
  id: string;
  direction: "IN" | "OUT";
  reason: string;
  reference: string;
  orderPhone?: string | null;
  source: "ORDER" | "TRANSFER";
  createdAt: string;
  items: Array<{
    productId: string;
    name: string;
    qty: number;
  }>;
}

function formatDateKey(value: string | null | undefined) {
  if (!value) return "-";
  const d = new Date(value);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const d = new Date(value);
  return `${formatDateKey(value)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function getDayKey(value: string | null | undefined) {
  if (!value) return "";
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function shouldShowReference(row: StockMovementRow): boolean {
  if (row.source === "ORDER") {
    return false;
  }

  if (row.source === "TRANSFER" && row.reason === "Агуулахаас авсан") {
    return false;
  }

  return true;
}

export default function DriverStockPage() {
  const [loading, setLoading] = useState(true);
  const [stocks, setStocks] = useState<StockRow[]>([]);
  const [movements, setMovements] = useState<StockMovementRow[]>([]);
  const [selectedDay, setSelectedDay] = useState<string>("");
  const [selectedProduct, setSelectedProduct] = useState<string>("");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/driver/stocks", { cache: "no-store" });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error ?? "Мэдээлэл ачаалж чадсангүй");
      }

      setStocks(Array.isArray(json.stocks) ? json.stocks : []);
      setMovements(Array.isArray(json.movements) ? json.movements : []);
    } catch (error) {
      console.error(error);
      alert("Барааны хөдөлгөөний мэдээлэл ачаалж чадсангүй");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const totalStock = useMemo(() => {
    return stocks.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
  }, [stocks]);

  const dayOptions = useMemo(() => {
    const days = new Set<string>();
    movements.forEach((row) => {
      const key = getDayKey(row.createdAt);
      if (key) days.add(key);
    });
    return Array.from(days).sort().reverse();
  }, [movements]);

  // Get unique products from history
  const productOptions = useMemo(() => {
    const products = new Set<string>();
    movements.forEach((row) => {
      row.items.forEach((item) => products.add(item.name));
    });
    return Array.from(products).sort();
  }, [movements]);

  const filteredMovements = useMemo(() => {
    return movements.filter((row) => {
      const dayKey = getDayKey(row.createdAt);
      const itemNames = row.items.map((item) => item.name);

      const dayMatch = !selectedDay || dayKey === selectedDay;
      const productMatch = !selectedProduct || itemNames.includes(selectedProduct);

      return dayMatch && productMatch;
    });
  }, [movements, selectedDay, selectedProduct]);

  const groupedByDay = useMemo(() => {
    const groups: Record<string, StockMovementRow[]> = {};
    filteredMovements.forEach((row) => {
      const dayKey = getDayKey(row.createdAt);
      if (!groups[dayKey]) {
        groups[dayKey] = [];
      }
      groups[dayKey].push(row);
    });

    return groups;
  }, [filteredMovements]);

  return (
    <div>
      <Header title="Барааны хөдөлгөөн" subtitle="Өдөр бүрийн орлого ба зарлагын түүх" showSearch={false} />

      <div className="space-y-4 p-3 sm:p-5">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-500">Нийт үлдэгдэл</p>
            <p className="text-xl font-semibold text-slate-800">{totalStock.toLocaleString("mn-MN")} ш</p>
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Одоогийн үлдэгдэл</CardTitle>
          </CardHeader>

          <div className="px-3 pb-3">
            {!loading && stocks.length === 0 ? (
              <p className="text-sm text-slate-400">Үлдэгдлийн мэдээлэл алга</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {stocks.map((row) => (
                  <li key={row.id} className="py-2 text-sm text-slate-700">
                    {row.product.name} - <span className="font-semibold text-slate-900">{Number(row.quantity).toLocaleString("mn-MN")} ш</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Барааны хөдөлгөөний түүх</CardTitle>
          </CardHeader>

          <div className="space-y-3 border-b border-slate-100 px-3 py-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Өдөр</label>
                <select
                  value={selectedDay}
                  onChange={(e) => setSelectedDay(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none"
                >
                  <option value="">Бүх өдөр</option>
                  {dayOptions.map((day) => (
                    <option key={day} value={day}>
                      {day.replaceAll("-", ".")}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Бараа</label>
                <select
                  value={selectedProduct}
                  onChange={(e) => setSelectedProduct(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none"
                >
                  <option value="">Бүх бараа</option>
                  {productOptions.map((product) => (
                    <option key={product} value={product}>
                      {product}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="space-y-3 px-3 pb-3 pt-3">
            {!loading && filteredMovements.length === 0 && <p className="text-sm text-slate-400">Хөдөлгөөний түүх алга</p>}

            {Object.entries(groupedByDay)
              .sort(([a], [b]) => b.localeCompare(a))
              .map(([dayKey, rows]) => {
                const dayIn = rows
                  .filter((x) => x.direction === "IN")
                  .reduce((s, x) => s + x.items.reduce((a, i) => a + i.qty, 0), 0);
                const dayOut = rows
                  .filter((x) => x.direction === "OUT")
                  .reduce((s, x) => s + x.items.reduce((a, i) => a + i.qty, 0), 0);

                return (
                  <div key={dayKey} className="rounded-xl border border-slate-200 bg-white">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
                      <p className="text-sm font-semibold text-slate-700">{dayKey.replaceAll("-", ".")}</p>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {rows.map((row) => (
                        <div key={row.id} className="px-3 py-2">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs text-slate-500">{formatDateTime(row.createdAt)}</p>
                            <p className={`text-xs font-semibold ${row.direction === "IN" ? "text-emerald-700" : "text-rose-700"}`}>
                              {row.direction === "IN" ? "Нэмэгдсэн" : "Хасагдсан"}
                            </p>
                          </div>
                          <p className="text-sm font-medium text-slate-700">{row.reason}</p>
                          {shouldShowReference(row) && <p className="text-xs text-slate-500">{row.reference}</p>}
                          {row.orderPhone && <p className="text-xs text-slate-500">Утас: {row.orderPhone}</p>}
                          <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-slate-600">
                            {row.items.map((item, index) => (
                              <li key={`${row.id}-${item.productId}-${index}`}>
                                {item.name} x{item.qty}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
          </div>
        </Card>
      </div>
    </div>
  );
}
