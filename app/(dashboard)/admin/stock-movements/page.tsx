"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeftRight, Check, ChevronDown, Plus, Trash2 } from "lucide-react";
import Header from "@/components/layout/Header";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { formatDateTime } from "@/lib/utils";
import toast from "react-hot-toast";

type LocationType = "WAREHOUSE" | "DRIVER";
type LocationValue = "WAREHOUSE" | `DRIVER:${string}`;

interface Driver {
  id: string;
  name: string;
}

interface ProductOption {
  id: string;
  name: string;
  warehouseQty: number;
  driverBreakdown: Record<string, number>;
}

interface TransferItem {
  id: string;
  quantity: number;
  product: { id: string; name: string };
}

interface TransferRecord {
  id: string;
  referenceCode: string;
  createdAt: string;
  note: string | null;
  createdBy: { id: string; name: string };
  fromLabel: string;
  toLabel: string;
  items: TransferItem[];
}

interface DraftItem {
  id: string;
  productId: string;
  quantity: string;
}

interface LocationOption {
  value: LocationValue;
  label: string;
}

const defaultDraftItem = (): DraftItem => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
  productId: "",
  quantity: "1",
});
const WAREHOUSE_VALUE: LocationValue = "WAREHOUSE";

function parseLocation(value: string): { type: LocationType; driverId: string } {
  if (value === WAREHOUSE_VALUE) {
    return { type: "WAREHOUSE", driverId: "" };
  }

  const [, driverId = ""] = value.split(":");
  return { type: "DRIVER", driverId };
}

export default function StockMovementsPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [transfers, setTransfers] = useState<TransferRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [fromLocation, setFromLocation] = useState<LocationValue>(WAREHOUSE_VALUE);
  const [toLocation, setToLocation] = useState<LocationValue>(WAREHOUSE_VALUE);
  const [note, setNote] = useState("");
  const [items, setItems] = useState<DraftItem[]>([defaultDraftItem()]);
  const [itemQueries, setItemQueries] = useState<Record<string, string>>({});
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [selectedFromFilters, setSelectedFromFilters] = useState<string[]>([]);
  const [selectedToFilters, setSelectedToFilters] = useState<string[]>([]);
  const [selectedProductFilters, setSelectedProductFilters] = useState<string[]>([]);
  const [selectedCreatedByFilters, setSelectedCreatedByFilters] = useState<string[]>([]);
  const [isFromDropdownOpen, setIsFromDropdownOpen] = useState(false);
  const [isToDropdownOpen, setIsToDropdownOpen] = useState(false);
  const [isProductDropdownOpen, setIsProductDropdownOpen] = useState(false);
  const [isCreatedByDropdownOpen, setIsCreatedByDropdownOpen] = useState(false);
  const [productFilterQuery, setProductFilterQuery] = useState("");
  const [fromDateFilter, setFromDateFilter] = useState("");
  const [toDateFilter, setToDateFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [totalTransfers, setTotalTransfers] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const noteTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      const isDateFilterActive = fromDateFilter !== "" || toDateFilter !== "";
      params.set("page", isDateFilterActive ? "1" : String(currentPage));
      params.set("limit", isDateFilterActive ? "5000" : String(pageSize));
      if (fromDateFilter) params.set("fromDate", fromDateFilter);
      if (toDateFilter) params.set("toDate", toDateFilter);

      const res = await fetch(`/api/stock/transfers?${params.toString()}`);
      if (!res.ok) throw new Error("Failed");
      const json = await res.json();
      setDrivers(json.drivers ?? []);
      setProducts(json.products ?? []);
      setTransfers(json.transfers ?? []);
      setTotalTransfers(Number(json.meta?.total ?? 0));
      setTotalPages(Number(json.meta?.totalPages ?? 1));
      if (isDateFilterActive) {
        setCurrentPage(1);
      }
    } catch {
      toast.error("Барааны хөдөлгөөний мэдээлэл уншихад алдаа гарлаа");
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, fromDateFilter, pageSize, toDateFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    setCurrentPage(1);
  }, [pageSize]);

  useEffect(() => {
    if (fromDateFilter && toDateFilter && fromDateFilter > toDateFilter) {
      setToDateFilter(fromDateFilter);
    }
  }, [fromDateFilter, toDateFilter]);

  useEffect(() => {
    const element = noteTextareaRef.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.max(38, element.scrollHeight)}px`;
  }, [note]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest("[data-transfer-filter-dropdown='from']")) {
        setIsFromDropdownOpen(false);
      }
      if (!target.closest("[data-transfer-filter-dropdown='to']")) {
        setIsToDropdownOpen(false);
      }
      if (!target.closest("[data-transfer-filter-dropdown='product']")) {
        setIsProductDropdownOpen(false);
      }
      if (!target.closest("[data-transfer-filter-dropdown='createdBy']")) {
        setIsCreatedByDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const locationOptions = useMemo<LocationOption[]>(
    () => [
      { value: WAREHOUSE_VALUE, label: "Агуулах" },
      ...drivers.map((driver) => ({ value: `DRIVER:${driver.id}` as LocationValue, label: driver.name })),
    ],
    [drivers]
  );

  const parsedFromLocation = useMemo(() => parseLocation(fromLocation), [fromLocation]);
  const parsedToLocation = useMemo(() => parseLocation(toLocation), [toLocation]);

  const destinationLabel = useMemo(() => {
    if (parsedToLocation.type === "WAREHOUSE") return "Агуулах";
    return drivers.find((driver) => driver.id === parsedToLocation.driverId)?.name ?? "Жолооч";
  }, [drivers, parsedToLocation]);

  const getWarehouseQty = useCallback(
    (productId: string) => products.find((entry) => entry.id === productId)?.warehouseQty ?? 0,
    [products]
  );

  const getDriverQty = useCallback(
    (productId: string, driverId: string) => {
      const product = products.find((entry) => entry.id === productId);
      if (!product || !driverId) return 0;
      return product.driverBreakdown[driverId] ?? 0;
    },
    [products]
  );

  const getAvailableQty = useCallback(
    (productId: string) => {
      if (parsedFromLocation.type === "WAREHOUSE") {
        return getWarehouseQty(productId);
      }

      return getDriverQty(productId, parsedFromLocation.driverId);
    },
    [getDriverQty, getWarehouseQty, parsedFromLocation]
  );

  const getDestinationQty = useCallback(
    (productId: string) => {
      if (parsedToLocation.type === "WAREHOUSE") {
        return getWarehouseQty(productId);
      }

      return getDriverQty(productId, parsedToLocation.driverId);
    },
    [getDriverQty, getWarehouseQty, parsedToLocation]
  );

  const addItem = () => setItems((current) => [...current, defaultDraftItem()]);

  const updateItem = (index: number, key: keyof DraftItem, value: string) => {
    setItems((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, [key]: value } : item)));
  };

  const removeItem = (index: number) => {
    setItems((current) => {
      if (current.length === 1) return current;
      const target = current[index];
      if (target) {
        setItemQueries((existing) => {
          const next = { ...existing };
          delete next[target.id];
          return next;
        });
        setActiveItemId((currentActive) => (currentActive === target.id ? null : currentActive));
      }
      return current.filter((_, itemIndex) => itemIndex !== index);
    });
  };

  const resetForm = () => {
    setFromLocation(WAREHOUSE_VALUE);
    setToLocation(WAREHOUSE_VALUE);
    setNote("");
    setItems([defaultDraftItem()]);
    setItemQueries({});
    setActiveItemId(null);
  };

  const handleItemProductQueryChange = (itemId: string, query: string) => {
    setItemQueries((current) => ({ ...current, [itemId]: query }));
    const normalized = query.trim().toLowerCase();
    const matched = products.find((product) => product.name.trim().toLowerCase() === normalized);

    if (matched) {
      const index = items.findIndex((item) => item.id === itemId);
      if (index >= 0) {
        updateItem(index, "productId", matched.id);
      }
      return;
    }

    if (!normalized) {
      const index = items.findIndex((item) => item.id === itemId);
      if (index >= 0) {
        updateItem(index, "productId", "");
      }
    }
  };

  const handleSelectItemProduct = (index: number, itemId: string, product: ProductOption) => {
    setItemQueries((current) => ({ ...current, [itemId]: product.name }));
    updateItem(index, "productId", product.id);
    setActiveItemId(null);
  };

  const handleSubmit = async () => {
    const normalizedItems = items
      .map((item) => ({ productId: item.productId, quantity: Number(item.quantity) }))
      .filter((item) => item.productId && Number.isFinite(item.quantity) && item.quantity > 0);

    if (normalizedItems.length === 0) {
      toast.error("Дор хаяж нэг бараа, тоо ширхэг оруулна уу");
      return;
    }

    if (fromLocation === toLocation) {
      toast.error("Хаанаас болон хаашаа ижил байж болохгүй");
      return;
    }

    const parsedFrom = parseLocation(fromLocation);
    const parsedTo = parseLocation(toLocation);

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/stock/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromType: parsedFrom.type,
          fromDriverId: parsedFrom.type === "DRIVER" ? parsedFrom.driverId : null,
          toType: parsedTo.type,
          toDriverId: parsedTo.type === "DRIVER" ? parsedTo.driverId : null,
          note,
          items: normalizedItems,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error ?? "Хөдөлгөөн хадгалахад алдаа гарлаа");
      }

      toast.success("Барааны хөдөлгөөн амжилттай бүртгэгдлээ");
      resetForm();
      await fetchData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Алдаа гарлаа");
    } finally {
      setIsSubmitting(false);
    }
  };

  const fromFilterOptions = useMemo(
    () => Array.from(new Set(transfers.map((transfer) => transfer.fromLabel))).sort((a, b) => a.localeCompare(b, "mn")),
    [transfers]
  );

  const toFilterOptions = useMemo(
    () => Array.from(new Set(transfers.map((transfer) => transfer.toLabel))).sort((a, b) => a.localeCompare(b, "mn")),
    [transfers]
  );

  const productFilterOptions = useMemo(
    () =>
      Array.from(
        new Set(
          transfers.flatMap((transfer) => transfer.items.map((item) => item.product.name))
        )
      ).sort((a, b) => a.localeCompare(b, "mn")),
    [transfers]
  );

  const createdByFilterOptions = useMemo(
    () => Array.from(new Set(transfers.map((transfer) => transfer.createdBy.name))).sort((a, b) => a.localeCompare(b, "mn")),
    [transfers]
  );

  useEffect(() => {
    setSelectedFromFilters((current) => current.filter((value) => fromFilterOptions.includes(value)));
  }, [fromFilterOptions]);

  useEffect(() => {
    setSelectedToFilters((current) => current.filter((value) => toFilterOptions.includes(value)));
  }, [toFilterOptions]);

  useEffect(() => {
    setSelectedProductFilters((current) => current.filter((value) => productFilterOptions.includes(value)));
  }, [productFilterOptions]);

  useEffect(() => {
    setSelectedCreatedByFilters((current) => current.filter((value) => createdByFilterOptions.includes(value)));
  }, [createdByFilterOptions]);

  const visibleTransfers = useMemo(() => {
    const hasActiveFilters =
      selectedFromFilters.length > 0 ||
      selectedToFilters.length > 0 ||
      selectedProductFilters.length > 0 ||
      selectedCreatedByFilters.length > 0 ||
      fromDateFilter !== "" ||
      toDateFilter !== "";

    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    const parseStartOfDay = (value: string) => {
      if (!value) return null;
      const [year, month, day] = value.split("-").map(Number);
      if (!year || !month || !day) return null;
      return new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
    };
    const parseEndOfDay = (value: string) => {
      if (!value) return null;
      const [year, month, day] = value.split("-").map(Number);
      if (!year || !month || !day) return null;
      return new Date(year, month - 1, day, 23, 59, 59, 999).getTime();
    };
    const fromTime = parseStartOfDay(fromDateFilter);
    const toTime = parseEndOfDay(toDateFilter);

    return transfers.filter((transfer) => {
      const createdAtTime = new Date(transfer.createdAt).getTime();
      if (!Number.isFinite(createdAtTime)) return false;

      if (!hasActiveFilters) {
        return createdAtTime >= sevenDaysAgo;
      }

      if (selectedFromFilters.length > 0 && !selectedFromFilters.includes(transfer.fromLabel)) return false;
      if (selectedToFilters.length > 0 && !selectedToFilters.includes(transfer.toLabel)) return false;

      if (selectedProductFilters.length > 0) {
        const transferProductNames = new Set(transfer.items.map((item) => item.product.name));
        const hasProductMatch = selectedProductFilters.some((name) => transferProductNames.has(name));
        if (!hasProductMatch) return false;
      }

      if (selectedCreatedByFilters.length > 0 && !selectedCreatedByFilters.includes(transfer.createdBy.name)) return false;

      if (fromTime && createdAtTime < fromTime) return false;
      if (toTime && createdAtTime > toTime) return false;

      return true;
    });
  }, [fromDateFilter, selectedCreatedByFilters, selectedFromFilters, selectedProductFilters, selectedToFilters, toDateFilter, transfers]);

  const visibleProductFilterOptions = useMemo(() => {
    const query = productFilterQuery.trim().toLowerCase();
    if (!query) return productFilterOptions;
    return productFilterOptions.filter((name) => name.toLowerCase().includes(query));
  }, [productFilterOptions, productFilterQuery]);

  const toggleFilterValue = (value: string, setter: React.Dispatch<React.SetStateAction<string[]>>) => {
    setter((current) => (current.includes(value) ? current.filter((entry) => entry !== value) : [...current, value]));
  };

  const dropdownLabel = (selected: string[]) => {
    if (selected.length === 0) return "Бүгд";
    if (selected.length === 1) return selected[0];
    return `${selected.length} сонгосон`;
  };

  return (
    <div>
      <Header
        title="Бараа бүтээгдэхүүний хөдөлгөөн"
        subtitle="Агуулах болон жолоочдын хооронд бараа шилжүүлэх"
        showSearch={false}
      />

      <div className="p-5 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Шинэ хөдөлгөөн бүртгэх</CardTitle>
          </CardHeader>

          <div className="overflow-x-auto">
            <div className="grid min-w-[920px] grid-cols-[260px_24px_260px_minmax(320px,1fr)] items-end gap-x-2 gap-y-1">
              <label className="text-sm font-medium text-slate-700">Хаанаас</label>
              <div />
              <label className="text-sm font-medium text-slate-700">Хаашаа</label>
              <label className="text-sm font-medium text-slate-700">Тайлбар</label>

              <select
                value={fromLocation}
                onChange={(e) => setFromLocation(e.target.value as LocationValue)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {locationOptions.map((option) => (
                  <option key={`from-${option.value}`} value={option.value}>{option.label}</option>
                ))}
              </select>

              <div className="flex items-center justify-center self-center -translate-y-1 text-slate-400">
                <ArrowLeftRight className="w-5 h-5" />
              </div>

              <select
                value={toLocation}
                onChange={(e) => setToLocation(e.target.value as LocationValue)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {locationOptions.map((option) => (
                  <option key={`to-${option.value}`} value={option.value}>{option.label}</option>
                ))}
              </select>

              <textarea
                ref={noteTextareaRef}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={1}
                placeholder="Жишээ нь: Өглөөний түгээлтэд хуваарилсан"
                className="w-full resize-none overflow-hidden rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-slate-700">Барааны жагсаалт</h3>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[1.7fr_110px_120px_140px_48px] gap-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              <span>Бараа</span>
              <span className="text-center">Боломжит</span>
              <span className="text-center">Тоо ширхэг</span>
              <span className="text-center">{destinationLabel} үлдэгдэл</span>
              <span></span>
            </div>

            <div className="space-y-2">
              {items.map((item, index) => {
                const availableQty = getAvailableQty(item.productId);
                const destinationQty = getDestinationQty(item.productId);
                return (
                  <div key={item.id} className="grid grid-cols-1 lg:grid-cols-[1.7fr_110px_120px_140px_48px] gap-2 items-center rounded-xl border border-slate-100 bg-slate-50/70 p-2">
                    <div>
                      <div className="relative">
                        <input
                          type="text"
                          value={itemQueries[item.id] ?? products.find((product) => product.id === item.productId)?.name ?? ""}
                          onFocus={() => setActiveItemId(item.id)}
                          onBlur={() => {
                            window.setTimeout(() => {
                              setActiveItemId((current) => (current === item.id ? null : current));
                            }, 120);
                          }}
                          onChange={(e) => handleItemProductQueryChange(item.id, e.target.value)}
                          placeholder="Бараа сонгох / хайх"
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />

                        {activeItemId === item.id && (
                          <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-44 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
                            {products
                              .filter((product) => {
                                const query = (itemQueries[item.id] ?? "").trim().toLowerCase();
                                if (!query) return true;
                                return product.name.toLowerCase().includes(query);
                              })
                              .slice(0, 50)
                              .map((product) => (
                                <button
                                  key={product.id}
                                  type="button"
                                  onMouseDown={(event) => {
                                    event.preventDefault();
                                    handleSelectItemProduct(index, item.id, product);
                                  }}
                                  className="block w-full truncate px-3 py-2 text-left text-sm text-slate-700 hover:bg-blue-50"
                                >
                                  {product.name}
                                </button>
                              ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-center text-sm text-slate-700">
                        {item.productId ? availableQty : "-"}
                      </div>
                    </div>
                    <div>
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => updateItem(index, "quantity", e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-center text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-center text-sm text-slate-700">
                        {item.productId ? destinationQty : "-"}
                      </div>
                    </div>
                    <Button type="button" variant="ghost" size="sm" className="h-9" onClick={() => removeItem(index)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                );
              })}
            </div>

            <div className="pt-1 flex justify-end">
              <Button type="button" variant="outline" size="sm" leftIcon={<Plus className="w-4 h-4" />} onClick={addItem}>
                Бараа нэмэх
              </Button>
            </div>
          </div>

          <div className="mt-5 flex justify-end">
            <Button type="button" isLoading={isSubmitting} onClick={handleSubmit}>
              Хөдөлгөөн хадгалах
            </Button>
          </div>
        </Card>

        <Card padding="none">
          <div className="border-b border-slate-100 px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-base font-semibold text-slate-800">Бараа бүтээгдэхүүний хөдөлгөөний дэлгэрэнгүй</h3>
              <div className="text-sm text-slate-500">
                Нийт {totalTransfers} бичлэгээс {visibleTransfers.length} харагдаж байна
              </div>
            </div>
          </div>

          {isLoading ? (
            <div className="p-12 text-center text-sm text-slate-400">Ачааллаж байна...</div>
          ) : transfers.length === 0 &&
            fromDateFilter === "" &&
            toDateFilter === "" &&
            selectedFromFilters.length === 0 &&
            selectedToFilters.length === 0 &&
            selectedProductFilters.length === 0 &&
            selectedCreatedByFilters.length === 0 ? (
            <div className="p-12 text-center text-sm text-slate-400">Одоогоор бүртгэл алга</div>
          ) : (
            <div className="max-h-[1320px] overflow-auto">
              <table className="w-full table-fixed text-sm">
                <colgroup>
                  <col className="w-[220px]" />
                  <col className="w-[150px]" />
                  <col className="w-[150px]" />
                  <col className="w-[220px]" />
                  <col className="w-[240px]" />
                  <col className="w-[170px]" />
                </colgroup>
                <thead>
                  <tr className="sticky top-0 z-20 bg-slate-50 border-b border-slate-100">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Огноо</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Хаанаас</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Хаашаа</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Бараа</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Тайлбар</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Бүртгэсэн</th>
                  </tr>
                  <tr className="sticky top-[43px] z-20 bg-white border-b border-slate-100">
                    <th className="px-4 py-2 text-left">
                      <div className="grid grid-cols-2 gap-1">
                        <input
                          type="date"
                          value={fromDateFilter}
                          onChange={(e) => setFromDateFilter(e.target.value)}
                          className="w-full min-w-0 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <input
                          type="date"
                          value={toDateFilter}
                          onChange={(e) => setToDateFilter(e.target.value)}
                          className="w-full min-w-0 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </th>
                    <th className="px-4 py-2 text-left">
                      <div className="relative" data-transfer-filter-dropdown="from">
                        <button
                          type="button"
                          onClick={() => {
                            setIsFromDropdownOpen((v) => !v);
                            setIsToDropdownOpen(false);
                            setIsProductDropdownOpen(false);
                            setIsCreatedByDropdownOpen(false);
                          }}
                          className="flex w-full items-center justify-between rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <span className="truncate">{dropdownLabel(selectedFromFilters)}</span>
                          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isFromDropdownOpen ? "rotate-180" : ""}`} />
                        </button>
                        {isFromDropdownOpen && (
                          <div className="absolute left-0 top-[calc(100%+4px)] z-30 min-w-full rounded-md border border-slate-200 bg-white p-1 shadow-lg">
                            {fromFilterOptions.map((option) => {
                              const checked = selectedFromFilters.includes(option);
                              return (
                                <button
                                  key={`from-option-${option}`}
                                  type="button"
                                  onClick={() => toggleFilterValue(option, setSelectedFromFilters)}
                                  className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[11px] text-slate-700 hover:bg-slate-100"
                                >
                                  <span className={`inline-flex h-3.5 w-3.5 items-center justify-center rounded border ${checked ? "border-blue-500 bg-blue-500 text-white" : "border-slate-300 bg-white text-transparent"}`}><Check className="h-3 w-3" /></span>
                                  <span className="truncate">{option}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </th>
                    <th className="px-4 py-2 text-left">
                      <div className="relative" data-transfer-filter-dropdown="to">
                        <button
                          type="button"
                          onClick={() => {
                            setIsToDropdownOpen((v) => !v);
                            setIsFromDropdownOpen(false);
                            setIsProductDropdownOpen(false);
                            setIsCreatedByDropdownOpen(false);
                          }}
                          className="flex w-full items-center justify-between rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <span className="truncate">{dropdownLabel(selectedToFilters)}</span>
                          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isToDropdownOpen ? "rotate-180" : ""}`} />
                        </button>
                        {isToDropdownOpen && (
                          <div className="absolute left-0 top-[calc(100%+4px)] z-30 min-w-full rounded-md border border-slate-200 bg-white p-1 shadow-lg">
                            {toFilterOptions.map((option) => {
                              const checked = selectedToFilters.includes(option);
                              return (
                                <button
                                  key={`to-option-${option}`}
                                  type="button"
                                  onClick={() => toggleFilterValue(option, setSelectedToFilters)}
                                  className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[11px] text-slate-700 hover:bg-slate-100"
                                >
                                  <span className={`inline-flex h-3.5 w-3.5 items-center justify-center rounded border ${checked ? "border-blue-500 bg-blue-500 text-white" : "border-slate-300 bg-white text-transparent"}`}><Check className="h-3 w-3" /></span>
                                  <span className="truncate">{option}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </th>
                    <th className="px-4 py-2 text-left">
                      <div className="relative" data-transfer-filter-dropdown="product">
                        <button
                          type="button"
                          onClick={() => {
                            setIsProductDropdownOpen((v) => !v);
                            setIsFromDropdownOpen(false);
                            setIsToDropdownOpen(false);
                            setIsCreatedByDropdownOpen(false);
                          }}
                          className="flex w-full items-center justify-between rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <span className="truncate">{dropdownLabel(selectedProductFilters)}</span>
                          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isProductDropdownOpen ? "rotate-180" : ""}`} />
                        </button>
                        {isProductDropdownOpen && (
                          <div className="absolute left-0 top-[calc(100%+4px)] z-30 min-w-full rounded-md border border-slate-200 bg-white p-1 shadow-lg">
                            <div className="px-1 pb-1">
                              <input
                                type="search"
                                value={productFilterQuery}
                                onChange={(e) => setProductFilterQuery(e.target.value)}
                                placeholder="Бараа"
                                className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                            <div className="max-h-[220px] overflow-y-auto">
                              {visibleProductFilterOptions.map((option) => {
                                const checked = selectedProductFilters.includes(option);
                                return (
                                  <button
                                    key={`product-option-${option}`}
                                    type="button"
                                    onClick={() => toggleFilterValue(option, setSelectedProductFilters)}
                                    className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[11px] text-slate-700 hover:bg-slate-100"
                                  >
                                    <span className={`inline-flex h-3.5 w-3.5 items-center justify-center rounded border ${checked ? "border-blue-500 bg-blue-500 text-white" : "border-slate-300 bg-white text-transparent"}`}><Check className="h-3 w-3" /></span>
                                    <span className="truncate">{option}</span>
                                  </button>
                                );
                              })}
                              {visibleProductFilterOptions.length === 0 && (
                                <div className="px-2 py-2 text-[11px] text-slate-400">Бараа олдсонгүй</div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </th>
                    <th className="px-4 py-2 text-left" />
                    <th className="px-4 py-2 text-left">
                      <div className="relative" data-transfer-filter-dropdown="createdBy">
                        <button
                          type="button"
                          onClick={() => {
                            setIsCreatedByDropdownOpen((v) => !v);
                            setIsFromDropdownOpen(false);
                            setIsToDropdownOpen(false);
                            setIsProductDropdownOpen(false);
                          }}
                          className="flex w-full items-center justify-between rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <span className="truncate">{dropdownLabel(selectedCreatedByFilters)}</span>
                          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isCreatedByDropdownOpen ? "rotate-180" : ""}`} />
                        </button>
                        {isCreatedByDropdownOpen && (
                          <div className="absolute left-0 top-[calc(100%+4px)] z-30 min-w-full rounded-md border border-slate-200 bg-white p-1 shadow-lg">
                            {createdByFilterOptions.map((option) => {
                              const checked = selectedCreatedByFilters.includes(option);
                              return (
                                <button
                                  key={`createdBy-option-${option}`}
                                  type="button"
                                  onClick={() => toggleFilterValue(option, setSelectedCreatedByFilters)}
                                  className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[11px] text-slate-700 hover:bg-slate-100"
                                >
                                  <span className={`inline-flex h-3.5 w-3.5 items-center justify-center rounded border ${checked ? "border-blue-500 bg-blue-500 text-white" : "border-slate-300 bg-white text-transparent"}`}><Check className="h-3 w-3" /></span>
                                  <span className="truncate">{option}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {visibleTransfers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-400">
                        Шүүлтүүрт тохирох бүртгэл олдсонгүй
                      </td>
                    </tr>
                  ) : (
                    visibleTransfers.map((transfer) => (
                      <tr key={transfer.id} className="align-top">
                        <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{formatDateTime(transfer.createdAt)}</td>
                        <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{transfer.fromLabel}</td>
                        <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{transfer.toLabel}</td>
                        <td className="px-4 py-3 text-slate-700">
                          <div className="space-y-1">
                            {transfer.items.map((item) => (
                              <p key={item.id}>{item.product.name} - {item.quantity}ш</p>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-500">{transfer.note || "-"}</td>
                        <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{transfer.createdBy.name}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {!isLoading && (fromDateFilter === "" && toDateFilter === "") && totalPages > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3">
              <div className="text-sm text-slate-500">Хуудас {currentPage} / {totalPages}</div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-slate-500">Хуудасны хэмжээ</label>
                <select
                  value={String(pageSize)}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="rounded-md border border-slate-200 bg-white px-2 py-1 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="25">25</option>
                  <option value="50">50</option>
                  <option value="100">100</option>
                </select>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                >
                  Өмнөх
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                >
                  Дараах
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
