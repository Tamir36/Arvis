"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Header from "@/components/layout/Header";
import { Card } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { formatPrice } from "@/lib/utils";
import toast from "react-hot-toast";

type SectionKey = "ACTIVE" | "INACTIVE";

interface ProductOption {
  id: string;
  name: string;
  status: string;
  stockQty: number;
}

interface ReportItem {
  id: string;
  section: SectionKey;
  productId: string;
  productName: string;
  productStatus: string;
  stockQty: number;
  unitPrice: number;
  totalAmount: number;
}

interface InventoryReportResponse {
  products: ProductOption[];
  sections: Record<SectionKey, ReportItem[]>;
}

const SECTION_META: Record<SectionKey, { title: string; subtitle: string }> = {
  ACTIVE: {
    title: "Идэвхтэй",
    subtitle: "Ашиглаж байгаа барааны жагсаалт",
  },
  INACTIVE: {
    title: "Идэвхгүй",
    subtitle: "Тусад нь хянах барааны жагсаалт",
  },
};

function buildEmptySections(): Record<SectionKey, ReportItem[]> {
  return {
    ACTIVE: [],
    INACTIVE: [],
  };
}

export default function InventoryReportPage() {
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [sections, setSections] = useState<Record<SectionKey, ReportItem[]>>(buildEmptySections);
  const [selectedProductIds, setSelectedProductIds] = useState<Record<SectionKey, string>>({
    ACTIVE: "",
    INACTIVE: "",
  });
  const [draftPrices, setDraftPrices] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [savingIds, setSavingIds] = useState<Record<string, boolean>>({});

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await window.fetch("/api/reports/inventory", { cache: "no-store" });
      if (!response.ok) throw new Error("Failed");

      const json: InventoryReportResponse = await response.json();
      setProducts(json.products ?? []);
      setSections({
        ACTIVE: json.sections?.ACTIVE ?? [],
        INACTIVE: json.sections?.INACTIVE ?? [],
      });
      setDraftPrices(() => {
        const next: Record<string, string> = {};
        for (const item of [...(json.sections?.ACTIVE ?? []), ...(json.sections?.INACTIVE ?? [])]) {
          next[item.id] = String(item.unitPrice ?? 0);
        }
        return next;
      });
    } catch {
      toast.error("Тайлан уншихад алдаа гарлаа");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const availableProductsBySection = useMemo(() => {
    const activeProductIds = new Set(sections.ACTIVE.map((item) => item.productId));

    const inactiveProductIds = new Set(sections.INACTIVE.map((item) => item.productId));

    return {
      ACTIVE: products.filter((product) => !activeProductIds.has(product.id) && !inactiveProductIds.has(product.id)),
      INACTIVE: products.filter((product) => !inactiveProductIds.has(product.id) && !activeProductIds.has(product.id)),
    } satisfies Record<SectionKey, ProductOption[]>;
  }, [products, sections]);

  useEffect(() => {
    setSelectedProductIds((current) => {
      const next = { ...current };
      if (next.ACTIVE && !availableProductsBySection.ACTIVE.some((product) => product.id === next.ACTIVE)) {
        next.ACTIVE = "";
      }
      if (next.INACTIVE && !availableProductsBySection.INACTIVE.some((product) => product.id === next.INACTIVE)) {
        next.INACTIVE = "";
      }
      return next;
    });
  }, [availableProductsBySection]);

  const handleAddItem = useCallback(async (section: SectionKey) => {
    const productId = selectedProductIds[section];
    if (!productId) {
      toast.error("Бараа сонгоно уу");
      return;
    }

    setIsMutating(true);
    try {
      const response = await window.fetch("/api/reports/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section, productId }),
      });

      if (!response.ok) throw new Error("Failed");
      const json = await response.json();
      const item: ReportItem = json.item;

      setSections((current) => ({
        ...current,
        [section]: [...current[section], item],
      }));
      setDraftPrices((current) => ({
        ...current,
        [item.id]: String(item.unitPrice ?? 0),
      }));
      setSelectedProductIds((current) => ({ ...current, [section]: "" }));
    } catch {
      toast.error("Бараа нэмэхэд алдаа гарлаа");
    } finally {
      setIsMutating(false);
    }
  }, [selectedProductIds]);

  const handleRemoveItem = useCallback(async (section: SectionKey, id: string) => {
    setIsMutating(true);
    try {
      const response = await window.fetch("/api/reports/inventory", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });

      if (!response.ok) throw new Error("Failed");

      setSections((current) => ({
        ...current,
        [section]: current[section].filter((item) => item.id !== id),
      }));
      setDraftPrices((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
    } catch {
      toast.error("Мөр устгахад алдаа гарлаа");
    } finally {
      setIsMutating(false);
    }
  }, []);

  const handleSavePrice = useCallback(async (section: SectionKey, itemId: string) => {
    const rawValue = draftPrices[itemId] ?? "0";
    const unitPrice = Number(rawValue);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      toast.error("Зөв үнэ оруулна уу");
      return;
    }

    setSavingIds((current) => ({ ...current, [itemId]: true }));
    try {
      const response = await window.fetch("/api/reports/inventory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: itemId, unitPrice }),
      });

      if (!response.ok) throw new Error("Failed");
      const json = await response.json();
      const updatedItem: ReportItem = json.item;

      setSections((current) => ({
        ...current,
        [section]: current[section].map((item) => item.id === itemId ? updatedItem : item),
      }));
      setDraftPrices((current) => ({ ...current, [itemId]: String(updatedItem.unitPrice ?? 0) }));
    } catch {
      toast.error("Үнэ хадгалахад алдаа гарлаа");
    } finally {
      setSavingIds((current) => ({ ...current, [itemId]: false }));
    }
  }, [draftPrices]);

  return (
    <div>
      <Header title="Бараа материалын тайлан" subtitle="Идэвхтэй ба идэвхгүй барааг үнэтэй нь хянах тайлан" />

      <div className="p-5 space-y-4">
        {isLoading ? (
          <Card padding="none">
            <div className="p-12 text-center">
              <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
              <p className="mt-3 text-sm text-slate-400">Ачааллаж байна...</p>
            </div>
          </Card>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {(["ACTIVE", "INACTIVE"] as SectionKey[]).map((section) => {
              const items = sections[section];
              const sectionTotal = items.reduce((sum, item) => sum + Number(item.totalAmount ?? 0), 0);

              return (
                <Card key={section} padding="none">
                  <div className="border-b border-slate-100 bg-slate-50 px-5 py-4">
                    <div className="flex flex-col gap-3">
                      <div>
                        <p className="text-base font-semibold text-slate-800">{SECTION_META[section].title}</p>
                        <p className="text-sm text-slate-500">{SECTION_META[section].subtitle}</p>
                      </div>

                      <div className="flex flex-col gap-2 sm:flex-row">
                        <select
                          value={selectedProductIds[section]}
                          onChange={(e) => setSelectedProductIds((current) => ({ ...current, [section]: e.target.value }))}
                          className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">Бараа сонгох</option>
                          {availableProductsBySection[section].map((product) => (
                            <option key={product.id} value={product.id}>
                              {product.name} | Үлдэгдэл: {product.stockQty}
                            </option>
                          ))}
                        </select>
                        <Button
                          type="button"
                          onClick={() => void handleAddItem(section)}
                          disabled={isMutating || !selectedProductIds[section]}
                        >
                          Нэмэх
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 bg-white text-xs font-semibold uppercase text-slate-400">
                          <th className="px-4 py-2 text-center">#</th>
                          <th className="px-4 py-2 text-left">Бараа</th>
                          <th className="px-4 py-2 text-right">Үлдэгдэл</th>
                          <th className="px-4 py-2 text-right">Захиалсан үнэ</th>
                          <th className="px-4 py-2 text-right">Үржвэр</th>
                          <th className="px-4 py-2 text-center"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {items.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-400">
                              Бараа нэмээгүй байна
                            </td>
                          </tr>
                        ) : (
                          items.map((item, index) => (
                            <tr key={item.id} className="align-middle hover:bg-slate-50/60">
                              <td className="px-4 py-1.5 text-center text-slate-400">{index + 1}</td>
                              <td className="px-4 py-1.5">
                                <div className="font-medium text-slate-700">{item.productName}</div>
                              </td>
                              <td className="px-4 py-1.5 text-right font-medium text-slate-700">{item.stockQty}</td>
                              <td className="px-4 py-1.5">
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={draftPrices[item.id] ?? String(item.unitPrice ?? 0)}
                                  onChange={(e) => setDraftPrices((current) => ({ ...current, [item.id]: e.target.value }))}
                                  onBlur={() => void handleSavePrice(section, item.id)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      void handleSavePrice(section, item.id);
                                    }
                                  }}
                                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-right text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  disabled={Boolean(savingIds[item.id])}
                                />
                              </td>
                              <td className="px-4 py-1.5 text-right font-semibold text-slate-800">{formatPrice(item.totalAmount)}</td>
                              <td className="px-4 py-1.5 text-center">
                                <button
                                  type="button"
                                  onClick={() => void handleRemoveItem(section, item.id)}
                                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-100"
                                  disabled={isMutating}
                                >
                                  Устгах
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-slate-200 bg-slate-50">
                          <td colSpan={4} className="px-4 py-2 text-right text-sm font-semibold text-slate-600">Нийт дүн</td>
                          <td className="px-4 py-2 text-right text-sm font-bold text-slate-800">{formatPrice(sectionTotal)}</td>
                          <td className="px-4 py-2" />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}