"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import Header from "@/components/layout/Header";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Textarea from "@/components/ui/Textarea";
import Badge, { productStatusBadge } from "@/components/ui/Badge";
import { formatDateTime, formatPrice } from "@/lib/utils";
import { ArrowLeft, Plus, Minus, Save, Pencil, Trash2, Image as ImageIcon } from "lucide-react";
import toast from "react-hot-toast";

interface Category {
  id: string;
  name: string;
}

interface StockMovement {
  id: string;
  type: "IN" | "OUT";
  quantity: number;
  beforeQty: number;
  afterQty: number;
  note: string | null;
  createdAt: string;
  user: { id: string; name: string } | null;
}

interface TransferHistoryItem {
  id: string;
  quantity: number;
  createdAt: string;
  note: string | null;
  createdBy: { id: string; name: string } | null;
  fromType: "WAREHOUSE" | "DRIVER";
  toType: "WAREHOUSE" | "DRIVER";
  fromDriver: { id: string; name: string } | null;
  toDriver: { id: string; name: string } | null;
  referenceCode: string;
}

interface SalesHistoryItem {
  id: string;
  createdAt: string;
  action: "DRIVER_STOCK_DEDUCTED" | "DRIVER_STOCK_RESTORED";
  quantity: number;
  reason?: string | null;
  actor: { id: string; name: string } | null;
  driver: { id: string; name: string } | null;
  order: { id: string; orderNumber: string; phone: string | null };
}

function getSalesReasonLabel(item: SalesHistoryItem): string {
  if (item.action === "DRIVER_STOCK_DEDUCTED") {
    if (item.reason === "delivered") return "Хүргэлт хийсэн тул хассан";
    if (item.reason === "reserved") return "Захиалга баталгаажсан тул хассан";
    if (item.reason === "driver_reassigned") return "Жолооч солигдсон тул хассан";
    return "Захиалгын дагуу хассан";
  }

  if (item.reason === "cancelled") return "Захиалга цуцлагдсан тул буцаасан";
  if (item.reason === "released") return "Захиалга хойшлогдсон тул буцаасан";
  if (item.reason === "driver_reassigned") return "Жолооч солигдсон тул буцаасан";
  return "Захиалгын төлөв өөрчлөгдсөн тул буцаасан";
}

interface ProductDetail {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: "ACTIVE" | "DRAFT" | "OUT_OF_STOCK";
  basePrice: number;
  categoryId: string | null;
  category: { id: string; name: string } | null;
  images: { id: string; url: string; isPrimary: boolean }[];
  inventory: { quantity: number } | null;
  driverStocks: { id: string; quantity: number; driver: { id: string; name: string } }[];
  totalStock: number;
  stockMovements: StockMovement[];
  transferHistory: TransferHistoryItem[];
  salesHistory: SalesHistoryItem[];
  createdAt: string;
  updatedAt: string;
}

export default function ProductDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const productId = params?.id;

  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  const [isEditMode, setIsEditMode] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editImageFiles, setEditImageFiles] = useState<File[]>([]);
  const [editImagePreviews, setEditImagePreviews] = useState<string[]>([]);

  const [stockAmount, setStockAmount] = useState("1");
  const [stockNote, setStockNote] = useState("");
  const [isUpdatingStock, setIsUpdatingStock] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [editForm, setEditForm] = useState({
    name: "",
    categoryId: "",
    basePrice: "0",
    status: "DRAFT",
    description: "",
  });

  const statusOptions = useMemo(
    () => [
      { value: "ACTIVE", label: "Идэвхтэй" },
      { value: "DRAFT", label: "Идэвхгүй" },
    ],
    []
  );

  const categoryOptions = useMemo(
    () => [
      { value: "", label: "Ангилалгүй" },
      ...categories.map((c) => ({ value: c.id, label: c.name })),
    ],
    [categories]
  );

  const fetchData = useCallback(async () => {
    if (!productId) return;

    setLoading(true);
    try {
      const [productRes, categoriesRes] = await Promise.all([
        fetch(`/api/products/${productId}`),
        fetch("/api/categories"),
      ]);

      if (!productRes.ok) throw new Error("Барааны мэдээлэл уншихад алдаа гарлаа");
      if (!categoriesRes.ok) throw new Error("Ангилал уншихад алдаа гарлаа");

      const productData = await productRes.json();
      const categoriesData = await categoriesRes.json();

      setProduct(productData);
      setCategories(categoriesData.data ?? []);
      setEditForm({
        name: productData.name ?? "",
        categoryId: productData.categoryId ?? "",
        basePrice: String(productData.basePrice ?? 0),
        status: productData.status ?? "DRAFT",
        description: productData.description ?? "",
      });
      setEditImageFiles([]);
      setEditImagePreviews((productData.images ?? []).map((image: { url: string }) => image.url));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Алдаа гарлаа");
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleEditImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    setEditImageFiles((prev) => [...prev, ...files]);

    files.forEach((file) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setEditImagePreviews((prev) => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeEditImage = (index: number) => {
    setEditImagePreviews((prev) => prev.filter((_, idx) => idx !== index));

    const existingCount = product?.images.length ?? 0;
    if (index >= existingCount) {
      const fileIndex = index - existingCount;
      setEditImageFiles((prev) => prev.filter((_, idx) => idx !== fileIndex));
    }
  };

  const handleSaveEdit = async () => {
    if (!productId || !product) return;

    const confirmSave = window.confirm("Барааны мэдээллийн өөрчлөлтийг хадгалах уу?");
    if (!confirmSave) return;

    setIsSavingEdit(true);
    try {
      let uploadedUrls: string[] = [];

      if (editImageFiles.length > 0) {
        for (const file of editImageFiles) {
          const fd = new FormData();
          fd.append("file", file);

          const uploadRes = await fetch("/api/upload", {
            method: "POST",
            body: fd,
          });

          if (!uploadRes.ok) {
            const uploadError = await uploadRes.json();
            throw new Error(uploadError.error ?? "Зураг оруулахад алдаа гарлаа");
          }

          const uploaded = await uploadRes.json();
          uploadedUrls.push(uploaded.url);
        }
      }

      const existingImageUrls = editImagePreviews.filter((preview) => preview.startsWith("/uploads/"));

      const res = await fetch(`/api/products/${productId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editForm.name,
          categoryId: editForm.categoryId || null,
          basePrice: Number(editForm.basePrice),
          status: editForm.status,
          description: editForm.description,
          images: [...existingImageUrls, ...uploadedUrls],
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Хадгалахад алдаа гарлаа");
      }

      toast.success("Барааны мэдээлэл шинэчлэгдлээ");
      setIsEditMode(false);
      await fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Алдаа гарлаа");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleStockAdjust = async (action: "IN" | "OUT") => {
    if (!productId) return;

    const quantity = Number(stockAmount);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      toast.error("Зөв тоо оруулна уу");
      return;
    }

    const actionLabel = action === "IN" ? "нэмэх" : "хасах";
    const confirmAction = window.confirm(`Үлдэгдлээс ${quantity} ширхэг ${actionLabel} уу?`);
    if (!confirmAction) return;

    setIsUpdatingStock(true);
    try {
      const res = await fetch(`/api/products/${productId}/stock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, quantity, note: stockNote.trim() || undefined }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Үлдэгдэл шинэчлэхэд алдаа гарлаа");
      }

      toast.success("Үлдэгдэл амжилттай шинэчлэгдлээ");
      setStockAmount("1");
      setStockNote("");
      await fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Алдаа гарлаа");
    } finally {
      setIsUpdatingStock(false);
    }
  };

  const handleDelete = async () => {
    if (!productId || !product) return;

    const confirmDelete = window.confirm(`"${product.name}" барааг устгах уу?`);
    if (!confirmDelete) return;

    setIsDeleting(true);
    try {
      const res = await fetch(`/api/products/${productId}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Устгахад алдаа гарлаа");
      }

      toast.success("Бараа амжилттай устгагдлаа");
      router.push("/admin/products");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Алдаа гарлаа");
    } finally {
      setIsDeleting(false);
    }
  };

  if (loading) {
    return (
      <div>
        <Header title="Барааны дэлгэрэнгүй" subtitle="Өгөгдөл ачаалж байна..." />
        <div className="p-5 text-center text-slate-500">Ачааллаж байна...</div>
      </div>
    );
  }

  if (!product) {
    return (
      <div>
        <Header title="Барааны дэлгэрэнгүй" subtitle="Бараа олдсонгүй" />
        <div className="p-5">
          <Button variant="secondary" leftIcon={<ArrowLeft className="w-4 h-4" />} onClick={() => router.push("/admin/products")}>
            Жагсаалт руу буцах
          </Button>
        </div>
      </div>
    );
  }

  const primaryImage = product.images.find((i) => i.isPrimary) ?? product.images[0];
  const combinedHistory = [
    ...product.stockMovements.map((item) => ({
      id: `stock-${item.id}`,
      createdAt: item.createdAt,
      delta: item.type === "IN" ? item.quantity : -item.quantity,
      quantityLabel: `${item.type === "IN" ? "+" : "-"}${item.quantity}`,
      quantityVariant: item.type === "IN" ? "success" as const : "danger" as const,
      actor: item.user?.name ?? "Систем",
      note: item.note?.trim() || "-",
    })),
    ...product.transferHistory.map((item) => {
      const fromLabel = item.fromType === "WAREHOUSE" ? "Агуулах" : item.fromDriver?.name ?? "Жолооч";
      const toLabel = item.toType === "WAREHOUSE" ? "Агуулах" : item.toDriver?.name ?? "Жолооч";

      return {
        id: `transfer-${item.id}`,
        createdAt: item.createdAt,
        delta: 0,
        quantityLabel: `${item.quantity} ш`,
        quantityVariant: "info" as const,
        actor: item.createdBy?.name ?? "Систем",
        note: `${fromLabel} -> ${toLabel}${item.note?.trim() ? ` | ${item.note.trim()}` : ""}`,
      };
    }),
    ...product.salesHistory.map((item) => ({
      id: `sale-${item.id}`,
      createdAt: item.createdAt,
      delta: item.action === "DRIVER_STOCK_RESTORED" ? item.quantity : -item.quantity,
      quantityLabel: item.action === "DRIVER_STOCK_RESTORED" ? `+${item.quantity}` : `-${item.quantity}`,
      quantityVariant: item.action === "DRIVER_STOCK_RESTORED" ? ("success" as const) : ("danger" as const),
      actor: item.driver?.name ?? item.actor?.name ?? "Жолооч",
      note: `${item.order.orderNumber} | ${item.driver?.name ?? item.actor?.name ?? "Жолооч"} | ${getSalesReasonLabel(item)}`,
    })),
  ]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map((item, index, history) => {
      let runningTotal = product.totalStock ?? 0;

      for (let currentIndex = 0; currentIndex < index; currentIndex += 1) {
        runningTotal -= history[currentIndex].delta;
      }

      return {
        ...item,
        result: String(runningTotal),
      };
    });

  return (
    <div>
      <Header title="Барааны дэлгэрэнгүй" subtitle={product.name} />

      <div className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <Button
            variant="secondary"
            leftIcon={<ArrowLeft className="w-4 h-4" />}
            onClick={() => router.push("/admin/products")}
          >
            Жагсаалт руу буцах
          </Button>

          <div className="flex items-center gap-2">
            {!isEditMode ? (
              <Button variant="outline" leftIcon={<Pencil className="w-4 h-4" />} onClick={() => setIsEditMode(true)}>
                Мэдээлэл засах
              </Button>
            ) : (
              <>
                <Button variant="secondary" onClick={() => setIsEditMode(false)}>
                  Цуцлах
                </Button>
                <Button leftIcon={<Save className="w-4 h-4" />} isLoading={isSavingEdit} onClick={handleSaveEdit}>
                  Хадгалах
                </Button>
              </>
            )}
            <Button variant="danger" leftIcon={<Trash2 className="w-4 h-4" />} isLoading={isDeleting} onClick={handleDelete}>
              Устгах
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle>Барааны мэдээлэл</CardTitle>
            </CardHeader>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-1">
                <div className="w-full aspect-square rounded-xl overflow-hidden bg-slate-100">
                  {primaryImage ? (
                    <Image src={primaryImage.url} alt={product.name} width={500} height={500} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-400">Зураггүй</div>
                  )}
                </div>
              </div>

              <div className="md:col-span-2 space-y-4">
                {isEditMode ? (
                  <>
                    <Input
                      label="Барааны нэр"
                      value={editForm.name}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
                    />
                    <Select
                      label="Ангилал"
                      options={categoryOptions}
                      value={editForm.categoryId}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, categoryId: e.target.value }))}
                    />
                    <Input
                      label="Үнэ"
                      type="number"
                      value={editForm.basePrice}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, basePrice: e.target.value }))}
                    />
                    <Select
                      label="Статус"
                      options={statusOptions}
                      value={editForm.status}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, status: e.target.value }))}
                    />
                    <Textarea
                      label="Тайлбар"
                      value={editForm.description}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, description: e.target.value }))}
                    />

                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-slate-700">Зураг</label>
                      <div className="flex flex-wrap gap-3">
                        {editImagePreviews.map((src, index) => (
                          <div key={`${src}-${index}`} className="relative w-20 h-20 rounded-xl overflow-hidden border border-slate-200 group bg-slate-100">
                            <img src={src} alt="" className="w-full h-full object-cover" />
                            <button
                              type="button"
                              onClick={() => removeEditImage(index)}
                              className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs"
                            >
                              Устгах
                            </button>
                          </div>
                        ))}
                        <label className="w-20 h-20 rounded-xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors">
                          <ImageIcon className="w-5 h-5 text-slate-400" />
                          <span className="text-[11px] text-slate-400 mt-1">Нэмэх</span>
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            className="hidden"
                            onChange={handleEditImageChange}
                          />
                        </label>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs text-slate-400">Нэр</p>
                      <p className="font-semibold text-slate-800">{product.name}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Ангилал</p>
                      <p className="text-slate-700">{product.category?.name ?? "-"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Үнэ</p>
                      <p className="text-slate-800 font-semibold">{formatPrice(product.basePrice)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Статус</p>
                      <Badge variant={productStatusBadge(product.status)}>
                        {product.status === "ACTIVE" ? "Идэвхтэй" : "Идэвхгүй"}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Slug</p>
                      <p className="text-slate-700">{product.slug}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Шинэчлэгдсэн</p>
                      <p className="text-slate-700">{formatDateTime(product.updatedAt)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Тайлбар</p>
                      <div
                        className="text-slate-700 prose prose-sm max-w-none"
                        dangerouslySetInnerHTML={{ __html: product.description || "<p>-</p>" }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Үлдэгдэл өөрчлөх</CardTitle>
            </CardHeader>
            <div className="space-y-4">
              <div className="text-sm">
                Нийт үлдэгдэл: <span className="font-bold text-slate-800">{product.totalStock ?? 0}</span>
                <span className="ml-2 text-xs text-slate-400">Агуулах: {product.inventory?.quantity ?? 0}</span>
              </div>
              {product.driverStocks.length > 0 && (
                <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                  {product.driverStocks.map((item) => (
                    <span key={item.id} className="rounded-full bg-slate-100 px-2.5 py-1">
                      {item.driver.name}: {item.quantity}
                    </span>
                  ))}
                </div>
              )}
              <Input
                label="Тоо ширхэг"
                type="number"
                min="1"
                value={stockAmount}
                onChange={(e) => setStockAmount(e.target.value)}
              />
              <Textarea
                label="Тайлбар (сонголттой)"
                rows={2}
                value={stockNote}
                onChange={(e) => setStockNote(e.target.value)}
              />
              <div className="grid grid-cols-2 gap-2">
                <Button
                  leftIcon={<Plus className="w-4 h-4" />}
                  isLoading={isUpdatingStock}
                  onClick={() => handleStockAdjust("IN")}
                >
                  Нэмэх
                </Button>
                <Button
                  variant="danger"
                  leftIcon={<Minus className="w-4 h-4" />}
                  isLoading={isUpdatingStock}
                  onClick={() => handleStockAdjust("OUT")}
                >
                  Хасах
                </Button>
              </div>
            </div>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Үлдэгдлийн өөрчлөлтийн түүх</CardTitle>
          </CardHeader>

          {combinedHistory.length === 0 ? (
            <p className="text-sm text-slate-400">Түүх байхгүй байна</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400">Он сар</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400">Тоо ширхэг</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400">Хэн нэмсэн</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400">Тайлбар</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400">Эцсийн үлдэгдэл</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {combinedHistory.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3 text-slate-600">{formatDateTime(item.createdAt)}</td>
                      <td className="px-4 py-3">
                        <Badge variant={item.quantityVariant}>
                          {item.quantityLabel}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{item.actor}</td>
                      <td className="px-4 py-3 text-slate-600">{item.note}</td>
                      <td className="px-4 py-3 font-medium text-slate-800">{item.result}</td>
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
