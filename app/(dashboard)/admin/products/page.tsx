"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { Plus, Search, Eye } from "lucide-react";
import Header from "@/components/layout/Header";
import { Card } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Badge, { productStatusBadge } from "@/components/ui/Badge";
import Pagination from "@/components/ui/Pagination";
import { formatPrice, formatDate } from "@/lib/utils";
import { mn } from "@/locales/mn";
import toast from "react-hot-toast";

const STATUS_OPTIONS = [
  { value: "", label: "Бүх статус" },
  { value: "ACTIVE", label: "Идэвхтэй" },
  { value: "DRAFT", label: "Идэвхгүй" },
];

const PAGE_SIZE_OPTIONS = [10, 30, 50, 100] as const;

interface Product {
  id: string;
  name: string;
  basePrice: number;
  status: string;
  createdAt: string;
  category: { name: string } | null;
  images: { url: string; isPrimary: boolean }[];
  inventory: { quantity: number } | null;
  totalStock: number;
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");

  const fetchProducts = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: pageSize.toString(),
        ...(search && { search }),
        ...(status && { status }),
      });
      const res = await fetch(`/api/products?${params}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const json = await res.json();
      setProducts(json.data ?? []);
      setTotal(json.meta?.total ?? 0);
    } catch {
      toast.error("Бараа уншихад алдаа гарлаа");
    } finally {
      setIsLoading(false);
    }
  }, [page, pageSize, search, status]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  return (
    <div>
      <Header title={mn.products.title} subtitle="Бараа бүтээгдэхүүний жагсаалт" />

      <div className="p-5 space-y-4">
        {/* Actions bar */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Нэр хайх..."
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 bg-white text-sm 
                placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={status}
              onChange={(e) => { setStatus(e.target.value); setPage(1); }}
              className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-700
                focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>

            <Link href="/admin/products/new">
              <Button size="sm" leftIcon={<Plus className="w-4 h-4" />}>
                Шинэ бараа
              </Button>
            </Link>
          </div>
        </div>

        {/* Table */}
        <Card padding="none">
          {isLoading ? (
            <div className="p-12 text-center">
              <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-sm text-slate-400 mt-3">Ачааллаж байна...</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase w-10">#</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Бараа</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Ангилал</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Үнэ</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Нөөц</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Статус</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Огноо</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400 uppercase"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {products.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-14 text-center text-sm text-slate-400">
                          Бараа олдсонгүй
                        </td>
                      </tr>
                    ) : (
                      products.map((p, index) => {
                        const primaryImg = p.images.find((i) => i.isPrimary) ?? p.images[0];
                        const rowNumber = (page - 1) * pageSize + index + 1;
                        return (
                          <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-4 py-3 text-center text-sm font-medium text-slate-400">{rowNumber}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl overflow-hidden bg-slate-100 shrink-0">
                                  {primaryImg ? (
                                    <Image
                                      src={primaryImg.url}
                                      alt={p.name}
                                      width={40}
                                      height={40}
                                      className="w-full h-full object-cover"
                                    />
                                  ) : (
                                    <div className="w-full h-full bg-slate-200 flex items-center justify-center">
                                      <span className="text-slate-400 text-xs">📦</span>
                                    </div>
                                  )}
                                </div>
                                <span className="font-medium text-slate-800 whitespace-normal break-words">{p.name}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-slate-600">{p.category?.name ?? "-"}</td>
                            <td className="px-4 py-3 font-semibold text-slate-800">
                              {formatPrice(Number(p.basePrice))}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`font-medium ${(p.totalStock ?? 0) < 10 ? "text-orange-500" : "text-slate-700"}`}>
                                {p.totalStock ?? 0}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <Badge variant={productStatusBadge(p.status)}>
                                {mn.status[p.status as keyof typeof mn.status] ?? p.status}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-400">{formatDate(p.createdAt)}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-end gap-1">
                                <Link href={`/admin/products/${p.id}`}>
                                  <button className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors text-sm font-medium">
                                    <Eye className="w-4 h-4" />
                                    <span>Дэлгэрэнгүй</span>
                                  </button>
                                </Link>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-slate-100">
                <Pagination
                  page={page}
                  totalPages={Math.ceil(total / pageSize)}
                  total={total}
                  pageSize={pageSize}
                  onPageChange={setPage}
                  pageSizeOptions={PAGE_SIZE_OPTIONS}
                  onPageSizeChange={(size) => {
                    setPageSize(size);
                    setPage(1);
                  }}
                />
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
