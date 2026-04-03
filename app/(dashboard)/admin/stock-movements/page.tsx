"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, Plus, Trash2 } from "lucide-react";
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

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/stock/transfers");
      if (!res.ok) throw new Error("Failed");
      const json = await res.json();
      setDrivers(json.drivers ?? []);
      setProducts(json.products ?? []);
      setTransfers(json.transfers ?? []);
    } catch {
      toast.error("Барааны хөдөлгөөний мэдээлэл уншихад алдаа гарлаа");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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

  return (
    <div>
      <Header title="Бараа бүтээгдэхүүний хөдөлгөөн" subtitle="Агуулах болон жолоочдын хооронд бараа шилжүүлэх" />

      <div className="p-5 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Шинэ хөдөлгөөн бүртгэх</CardTitle>
          </CardHeader>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-4 items-end">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Хаанаас</label>
              <select
                value={fromLocation}
                onChange={(e) => setFromLocation(e.target.value as LocationValue)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {locationOptions.map((option) => (
                  <option key={`from-${option.value}`} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-center pb-2 text-slate-400">
              <ArrowLeftRight className="w-5 h-5" />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Хаашаа</label>
              <select
                value={toLocation}
                onChange={(e) => setToLocation(e.target.value as LocationValue)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {locationOptions.map((option) => (
                  <option key={`to-${option.value}`} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-slate-700">Барааны жагсаалт</h3>
              <Button type="button" variant="outline" size="sm" leftIcon={<Plus className="w-4 h-4" />} onClick={addItem}>
                Бараа нэмэх
              </Button>
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

            <p className="text-xs text-slate-400">
              Боломжит: {parsedFromLocation.type === "WAREHOUSE" ? "хаанаас сонгосон агуулахын үлдэгдэл" : "хаанаас сонгосон жолоочийн үлдэгдэл"}, {destinationLabel} үлдэгдэл: хаашаа сонгосон байршлын үлдэгдэл
            </p>
          </div>

          <div className="mt-4 space-y-2">
            <label className="text-sm font-medium text-slate-700">Тайлбар</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Жишээ нь: Өглөөний түгээлтэд хуваарилсан"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="mt-5 flex justify-end">
            <Button type="button" isLoading={isSubmitting} onClick={handleSubmit}>
              Хөдөлгөөн хадгалах
            </Button>
          </div>
        </Card>

        <Card padding="none">
          <div className="border-b border-slate-100 px-5 py-4">
            <h3 className="text-base font-semibold text-slate-800">Бараа бүтээгдэхүүний хөдөлгөөний дэлгэрэнгүй</h3>
          </div>

          {isLoading ? (
            <div className="p-12 text-center text-sm text-slate-400">Ачааллаж байна...</div>
          ) : transfers.length === 0 ? (
            <div className="p-12 text-center text-sm text-slate-400">Одоогоор бүртгэл алга</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Код</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Хаанаас - Хаашаа</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Бараа</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Тайлбар</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Бүртгэсэн</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Огноо</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {transfers.map((transfer) => (
                    <tr key={transfer.id} className="align-top">
                      <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">{transfer.referenceCode}</td>
                      <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{transfer.fromLabel} - {transfer.toLabel}</td>
                      <td className="px-4 py-3 text-slate-700">
                        <div className="space-y-1">
                          {transfer.items.map((item) => (
                            <p key={item.id}>{item.product.name} x {item.quantity}</p>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-500">{transfer.note || "-"}</td>
                      <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{transfer.createdBy.name}</td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{formatDateTime(transfer.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
