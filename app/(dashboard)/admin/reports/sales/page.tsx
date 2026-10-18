"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Header from "@/components/layout/Header";
import { Card } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { formatPrice } from "@/lib/utils";
import toast from "react-hot-toast";

interface ProductOption {
  id: string;
  name: string;
  status: string;
  familyCode: string | null;
  variantCode: string | null;
}

interface SalesReportItem {
  id: string;
  productId: string;
  productCode: string;
  productStatus: string;
  familyCode: string | null;
  variantCode: string | null;
  dailyAdCost: number;
  unitAdCap: number;
  soldQty: number;
}

interface SalesReportResponse {
  fromDate: string;
  toDate: string;
  dayCount: number;
  products: ProductOption[];
  items: SalesReportItem[];
}

interface ProductSearchOption {
  productId: string;
  reportCode: string;
  title: string;
  variantCount: number;
  variantsText: string;
  searchText: string;
}

interface CodeVariantSummary {
  variantCount: number;
  variantsText: string;
}

function todayString() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getReportCode(product: { id: string; familyCode: string | null; variantCode: string | null }): string {
  const familyCode = String(product.familyCode ?? "").trim();
  if (familyCode) return familyCode;
  const variantCode = String(product.variantCode ?? "").trim();
  if (variantCode) return variantCode;
  return product.id;
}

export default function SalesReportPage() {
  const [fromDate, setFromDate] = useState(todayString());
  const [toDate, setToDate] = useState(todayString());
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [items, setItems] = useState<SalesReportItem[]>([]);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [productSearchText, setProductSearchText] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [draftValues, setDraftValues] = useState<Record<string, { dailyAdCost: string; unitAdCap: string }>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [savingIds, setSavingIds] = useState<Record<string, boolean>>({});

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ fromDate, toDate });
      const response = await window.fetch(`/api/reports/sales?${params.toString()}`, { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Failed");
      }

      const json: SalesReportResponse = await response.json();
      setProducts(json.products ?? []);
      setItems(json.items ?? []);
      setDraftValues(() => {
        const next: Record<string, { dailyAdCost: string; unitAdCap: string }> = {};
        for (const row of json.items ?? []) {
          next[row.id] = {
            dailyAdCost: String(row.dailyAdCost ?? 0),
            unitAdCap: String(row.unitAdCap ?? 0),
          };
        }
        return next;
      });
    } catch {
      toast.error("Борлуулалтын тайлан уншихад алдаа гарлаа");
    } finally {
      setIsLoading(false);
    }
  }, [fromDate, toDate]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const sortedDates = useMemo(() => {
    if (!fromDate || !toDate) {
      return { start: fromDate, end: toDate };
    }
    return fromDate <= toDate
      ? { start: fromDate, end: toDate }
      : { start: toDate, end: fromDate };
  }, [fromDate, toDate]);

  const dayCount = useMemo(() => {
    if (!sortedDates.start || !sortedDates.end) return 1;
    const start = new Date(`${sortedDates.start}T00:00:00`);
    const end = new Date(`${sortedDates.end}T00:00:00`);
    const diffMs = end.getTime() - start.getTime();
    const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
    return Math.max(1, diffDays + 1);
  }, [sortedDates]);

  const availableProducts = useMemo(() => {
    const selectedCodes = new Set(items.map((item) => item.productCode));
    return products.filter((product) => {
      const reportCode = getReportCode(product);
      if (selectedCodes.has(reportCode)) return false;
      return true;
    });
  }, [items, products]);

  const productSearchOptions = useMemo<ProductSearchOption[]>(() => {
    const grouped = new Map<string, { representative: ProductOption; names: Set<string>; variantCount: number; variants: Set<string> }>();

    for (const product of availableProducts) {
      const reportCode = getReportCode(product);
      const current = grouped.get(reportCode);
      if (!current) {
        grouped.set(reportCode, {
          representative: product,
          names: new Set([product.name]),
          variantCount: 1,
          variants: new Set([String(product.variantCode ?? "").trim()].filter(Boolean)),
        });
      } else {
        current.names.add(product.name);
        current.variantCount += 1;
        const variant = String(product.variantCode ?? "").trim();
        if (variant) current.variants.add(variant);
      }
    }

    return Array.from(grouped.entries()).map(([reportCode, groupedValue]) => {
      const primaryName = Array.from(groupedValue.names)[0] ?? groupedValue.representative.name;
      const variantSuffix = groupedValue.variantCount > 1
        ? ` (${groupedValue.variantCount} өнгө/хэмжээ)`
        : "";
      const variantText = Array.from(groupedValue.variants).join(" ");
      const variantsText = Array.from(groupedValue.variants)
        .sort((a, b) => a.localeCompare(b))
        .join(", ");

      return {
        productId: groupedValue.representative.id,
        reportCode,
        title: `${reportCode} | ${primaryName}${variantSuffix}`,
        variantCount: groupedValue.variantCount,
        variantsText,
        searchText: `${reportCode} ${primaryName} ${variantText}`.toLowerCase(),
      };
    }).sort((a, b) => a.reportCode.localeCompare(b.reportCode));
  }, [availableProducts]);

  const filteredSearchOptions = useMemo(() => {
    const keyword = productSearchText.trim().toLowerCase();
    if (!keyword) return productSearchOptions;
    return productSearchOptions.filter((option) => option.searchText.includes(keyword));
  }, [productSearchOptions, productSearchText]);

  const selectedSearchOption = useMemo(
    () => productSearchOptions.find((option) => option.productId === selectedProductId) ?? null,
    [productSearchOptions, selectedProductId],
  );

  const codeVariantSummary = useMemo(() => {
    const map = new Map<string, CodeVariantSummary>();

    for (const product of products) {
      const code = getReportCode(product);
      const variant = String(product.variantCode ?? "").trim();
      const current = map.get(code);

      if (!current) {
        map.set(code, {
          variantCount: variant ? 1 : 0,
          variantsText: variant || "",
        });
        continue;
      }

      const variantSet = new Set(current.variantsText ? current.variantsText.split(", ") : []);
      if (variant) {
        variantSet.add(variant);
      }

      const nextVariants = Array.from(variantSet).filter(Boolean).sort((a, b) => a.localeCompare(b));
      map.set(code, {
        variantCount: nextVariants.length,
        variantsText: nextVariants.join(", "),
      });
    }

    return map;
  }, [products]);

  const optionByCode = useMemo(() => {
    const map = new Map<string, ProductSearchOption>();
    for (const option of productSearchOptions) {
      map.set(option.reportCode, option);
    }
    return map;
  }, [productSearchOptions]);

  useEffect(() => {
    if (selectedProductId && !productSearchOptions.some((option) => option.productId === selectedProductId)) {
      setSelectedProductId("");
    }
  }, [productSearchOptions, selectedProductId]);

  const rows = useMemo(() => {
    return items.map((item) => {
      const dailyAdCost = Number(draftValues[item.id]?.dailyAdCost ?? item.dailyAdCost ?? 0);
      const unitAdCap = Number(draftValues[item.id]?.unitAdCap ?? item.unitAdCap ?? 0);
      const safeDailyAdCost = Number.isFinite(dailyAdCost) && dailyAdCost >= 0 ? dailyAdCost : 0;
      const safeUnitAdCap = Number.isFinite(unitAdCap) && unitAdCap >= 0 ? unitAdCap : 0;
      const soldQty = Number(item.soldQty ?? 0);
      const selectedPeriodAdCost = safeDailyAdCost * dayCount;
      const actualUnitAdCost = soldQty > 0 ? selectedPeriodAdCost / soldQty : 0;

      return {
        ...item,
        dailyAdCost: safeDailyAdCost,
        unitAdCap: safeUnitAdCap,
        soldQty,
        selectedPeriodAdCost,
        actualUnitAdCost,
      };
    });
  }, [items, draftValues, dayCount]);

  const summary = useMemo(() => {
    return rows.reduce(
      (acc, row) => ({
        dailyAdCost: acc.dailyAdCost + row.dailyAdCost,
        unitAdCap: acc.unitAdCap + row.unitAdCap,
        selectedPeriodAdCost: acc.selectedPeriodAdCost + row.selectedPeriodAdCost,
        soldQty: acc.soldQty + row.soldQty,
      }),
      {
        dailyAdCost: 0,
        unitAdCap: 0,
        selectedPeriodAdCost: 0,
        soldQty: 0,
      },
    );
  }, [rows]);

  const summaryActualUnitAdCost = useMemo(() => {
    if (summary.soldQty <= 0) return 0;
    return summary.selectedPeriodAdCost / summary.soldQty;
  }, [summary.selectedPeriodAdCost, summary.soldQty]);

  const itemById = useMemo(() => {
    const map = new Map<string, SalesReportItem>();
    for (const item of items) {
      map.set(item.id, item);
    }
    return map;
  }, [items]);

  const handleAddProduct = useCallback(async () => {
    if (!selectedProductId) {
      toast.error("Бараа сонгоно уу");
      return;
    }

    setIsMutating(true);
    try {
      const response = await window.fetch("/api/reports/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: selectedProductId,
          dailyAdCost: 0,
          unitAdCap: 0,
        }),
      });

      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        throw new Error(String(json?.error ?? "Бараа нэмэхэд алдаа гарлаа"));
      }

      setSelectedProductId("");
      setProductSearchText("");
      setIsSearchOpen(false);
      await fetchData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Бараа нэмэхэд алдаа гарлаа");
    } finally {
      setIsMutating(false);
    }
  }, [fetchData, selectedProductId]);

  const handleRemoveItem = useCallback(async (id: string) => {
    setIsMutating(true);
    try {
      const response = await window.fetch("/api/reports/sales", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });

      if (!response.ok) {
        throw new Error("Failed");
      }

      await fetchData();
    } catch {
      toast.error("Мөр устгахад алдаа гарлаа");
    } finally {
      setIsMutating(false);
    }
  }, [fetchData]);

  const handleSaveRow = useCallback(async (id: string) => {
    const draft = draftValues[id];
    if (!draft) return;
    const source = itemById.get(id);
    if (!source) return;

    const dailyAdCost = Number(draft.dailyAdCost);
    const unitAdCap = Number(draft.unitAdCap);

    if (!Number.isFinite(dailyAdCost) || dailyAdCost < 0 || !Number.isFinite(unitAdCap) || unitAdCap < 0) {
      toast.error("Ads утгуудыг зөв оруулна уу");
      return;
    }

    // Avoid re-saving on focus/blur when nothing actually changed.
    if (dailyAdCost === Number(source.dailyAdCost ?? 0) && unitAdCap === Number(source.unitAdCap ?? 0)) {
      return;
    }

    setSavingIds((current) => ({ ...current, [id]: true }));
    try {
      const response = await window.fetch("/api/reports/sales", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, dailyAdCost, unitAdCap }),
      });

      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        throw new Error(String(json?.error ?? "Ads утга хадгалахад алдаа гарлаа"));
      }

      await fetchData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ads утга хадгалахад алдаа гарлаа");
    } finally {
      setSavingIds((current) => ({ ...current, [id]: false }));
    }
  }, [draftValues, fetchData, itemById]);

  return (
    <div>
      <Header title="Борлуулалтын тайлан" subtitle="Огноогоор борлуулалт болон сурталчилгааны зардлыг тооцох" />

      <div className="p-5 space-y-4">
        <Card>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-slate-400">-</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">
              <div>Сонгосон хоног: <span className="font-semibold">{dayCount}</span></div>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex flex-col gap-2">
            <div className="relative">
              <input
                type="text"
                value={productSearchText}
                onChange={(e) => {
                  setProductSearchText(e.target.value);
                  setIsSearchOpen(true);
                }}
                onFocus={() => setIsSearchOpen(true)}
                onBlur={() => {
                  setTimeout(() => {
                    setIsSearchOpen(false);
                  }, 120);
                }}
                placeholder="Барааны нэр эсвэл кодоор бичиж хайх"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && filteredSearchOptions.length > 0) {
                    e.preventDefault();
                    const first = filteredSearchOptions[0];
                    setSelectedProductId(first.productId);
                    setProductSearchText(first.title);
                    setIsSearchOpen(false);
                  }
                }}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />

              {isSearchOpen && (
                <div className="absolute z-20 mt-1 max-h-[170px] w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
                  {filteredSearchOptions.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-slate-400">Тохирох бараа олдсонгүй</div>
                  ) : (
                    filteredSearchOptions.map((option) => {
                      const isSelected = option.productId === selectedProductId;
                      return (
                        <button
                          key={option.reportCode}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setSelectedProductId(option.productId);
                            setProductSearchText(option.title);
                            setIsSearchOpen(false);
                          }}
                          className={`block w-full px-3 py-2 text-left text-sm transition-colors ${isSelected ? "bg-blue-50 text-blue-700" : "text-slate-700 hover:bg-slate-50"}`}
                        >
                          {option.title}
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="text-sm text-slate-500">
                {selectedSearchOption ? `Сонгосон: ${selectedSearchOption.title}` : "Бараа сонгоогүй байна"}
              </div>
              <Button type="button" onClick={() => void handleAddProduct()} disabled={isMutating || !selectedProductId}>
                Хүснэгтэд нэмэх
              </Button>
            </div>
          </div>
        </Card>

        {isLoading ? (
          <Card padding="none">
            <div className="p-12 text-center">
              <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
              <p className="mt-3 text-sm text-slate-400">Ачааллаж байна...</p>
            </div>
          </Card>
        ) : (
          <Card padding="none">
            <div className="overflow-x-auto rounded-2xl border border-slate-100">
              <table className="w-full min-w-[1360px] text-sm">
                <colgroup>
                  <col style={{ width: "56px" }} />
                  <col style={{ width: "360px" }} />
                  <col style={{ width: "200px" }} />
                  <col style={{ width: "300px" }} />
                  <col style={{ width: "260px" }} />
                  <col style={{ width: "200px" }} />
                  <col style={{ width: "280px" }} />
                  <col style={{ width: "120px" }} />
                </colgroup>
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/90 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3 text-center">#</th>
                    <th className="px-4 py-3 text-left">Барааны код</th>
                    <th className="px-4 py-3 text-right">Өдрийн ads зардал /₮/</th>
                    <th className="px-4 py-3 text-right">Нэгж бүтээгдэхүүний ads-д гарах дээд хэмжээ /₮/</th>
                    <th className="px-4 py-3 text-right">Сонгосон хугацаанд гарсан зардал /₮/</th>
                    <th className="px-4 py-3 text-center">Борлуулсан тоо</th>
                    <th className="px-4 py-3 text-right">Нэгж бүтээгдэхүүний ads-д гарсан зардал</th>
                    <th className="px-4 py-3 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-400">Хүснэгтэд бараа нэмээгүй байна</td>
                    </tr>
                  ) : (
                    rows.map((row, index) => {
                      const option = optionByCode.get(row.productCode);
                      const variantSummary = codeVariantSummary.get(row.productCode);

                      return (
                      <tr key={row.id} className="bg-white transition-colors odd:bg-white even:bg-slate-50/30 hover:bg-blue-50/40">
                        <td className="px-4 py-2 text-center text-slate-400">{index + 1}</td>
                        <td className="px-4 py-2">
                          <div className="max-w-[340px] truncate font-semibold text-slate-800" title={row.productCode}>{row.productCode}</div>
                          <div className="mt-0.5 text-xs text-slate-400">
                            {variantSummary && variantSummary.variantCount > 1
                              ? `(өнгө/хэмжээ): ${variantSummary.variantsText || "-"}`
                              : `(өнгө/хэмжээ): ${variantSummary?.variantsText || option?.variantsText || row.variantCode || "-"}`}
                          </div>
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={draftValues[row.id]?.dailyAdCost ?? String(row.dailyAdCost)}
                            onChange={(e) => setDraftValues((current) => ({
                              ...current,
                              [row.id]: {
                                dailyAdCost: e.target.value,
                                unitAdCap: current[row.id]?.unitAdCap ?? String(row.unitAdCap),
                              },
                            }))}
                            onBlur={() => void handleSaveRow(row.id)}
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-right text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            disabled={Boolean(savingIds[row.id])}
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={draftValues[row.id]?.unitAdCap ?? String(row.unitAdCap)}
                            onChange={(e) => setDraftValues((current) => ({
                              ...current,
                              [row.id]: {
                                dailyAdCost: current[row.id]?.dailyAdCost ?? String(row.dailyAdCost),
                                unitAdCap: e.target.value,
                              },
                            }))}
                            onBlur={() => void handleSaveRow(row.id)}
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-right text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            disabled={Boolean(savingIds[row.id])}
                          />
                        </td>
                        <td className="px-4 py-2 text-right font-medium text-slate-700">{formatPrice(row.selectedPeriodAdCost)}</td>
                        <td className="px-4 py-2 text-center font-semibold text-slate-800">{row.soldQty}</td>
                        <td className="px-4 py-2 text-right font-semibold text-blue-700">{formatPrice(row.actualUnitAdCost)}</td>
                        <td className="px-4 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => void handleRemoveItem(row.id)}
                            className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100"
                            disabled={isMutating}
                          >
                            Устгах
                          </button>
                        </td>
                      </tr>
                      );
                    })
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t border-slate-200 bg-slate-50">
                    <td className="px-4 py-3" />
                    <td className="px-4 py-3 text-left text-sm font-semibold text-slate-600">Нийт</td>
                    <td className="px-4 py-3 text-right text-sm font-semibold text-slate-700">{formatPrice(summary.dailyAdCost)}</td>
                    <td className="px-4 py-3 text-right text-sm font-semibold text-slate-700">{formatPrice(summary.unitAdCap)}</td>
                    <td className="px-4 py-3 text-right text-sm font-semibold text-slate-700">{formatPrice(summary.selectedPeriodAdCost)}</td>
                    <td className="px-4 py-3 text-center text-sm font-bold text-slate-800">{summary.soldQty}</td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-blue-700">{formatPrice(summaryActualUnitAdCost)}</td>
                    <td className="px-4 py-3" />
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
