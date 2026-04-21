"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import Header from "@/components/layout/Header";
import { Card } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { CalendarDays, Check, ChevronDown, Eye, RotateCcw, Save, Search, Trash2, X } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import toast from "react-hot-toast";

interface ProductOption {
  id: string;
  name: string;
  basePrice: number;
}

interface DriverOption {
  id: string;
  name: string;
}

interface FilterProductOption {
  id: string;
  name: string;
}

interface OrderRow {
  id: string;
  orderNumber: string;
  createdAt: string;
  delivery?: {
    timeSlot?: {
      date: string;
    } | null;
    agent?: {
      userId: string;
    } | null;
  } | null;
  total: number;
  status: string;
  paymentStatus: string;
  notes: string | null;
  shippingAddress: string | null;
  customer: {
    name: string;
    phone: string;
    address: string | null;
  };
  assignedTo: {
    id: string;
    name: string;
  } | null;
  items: {
    id: string;
    qty: number;
    product: {
      id: string;
      name: string;
    };
  }[];
  auditLogs: {
    id: string;
    action?: string;
    oldValue?: string | null;
    newValue?: string | null;
    createdAt?: string;
    user: {
      id: string;
      name: string;
      role?: string;
    };
  }[];
}

interface OrderDetails {
  id: string;
  orderNumber: string;
  createdAt: string;
  status: string;
  paymentStatus: string;
  notes: string | null;
  shippingAddress: string | null;
  customer: {
    id: string;
    phone: string;
    address: string | null;
  };
  assignedTo: {
    id: string;
    name: string;
  } | null;
  items: {
    id: string;
    qty: number;
    unitPrice: string | number;
    total: string | number;
    product: {
      id: string;
      name: string;
    };
  }[];
  auditLogs: {
    id: string;
    action: string;
    oldValue: string | null;
    newValue: string | null;
    createdAt: string;
    user: {
      id: string;
      name: string;
    } | null;
  }[];
}

interface OrderDraftItem {
  id?: string;
  productId: string;
  qty: string;
  unitPrice: string;
}

interface OrderEditDraft {
  customerPhone: string;
  shippingAddress: string;
  assignedDriverId: string;
  status: string;
  paymentStatus: string;
  notes: string;
  items: OrderDraftItem[];
}

interface RegistrationItem {
  id: string;
  productId: string;
  qty: string;
  linePrice: string;
}

const INPUT_CLASS = "w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

const STATUS_OPTIONS: Array<{ value: string; label: string; className: string }> = [
  { value: "BLANK", label: "Blank", className: "bg-white text-slate-500 border-slate-200" },
  { value: "PENDING", label: "Хүлээлгэ", className: "bg-sky-100 text-sky-700 border-sky-200" },
  { value: "CONFIRMED", label: "Хувиарласан", className: "bg-indigo-100 text-indigo-700 border-indigo-200" },
  { value: "DELIVERED", label: "Хүргэгдсэн", className: "bg-green-100 text-green-700 border-green-200" },
  { value: "CANCELLED", label: "Цуцалсан", className: "bg-red-100 text-red-700 border-red-200" },
  { value: "RETURNED", label: "Хойшлуулсан", className: "bg-slate-100 text-slate-700 border-slate-200" },
];

const REGISTRATION_STATUS_OPTIONS = STATUS_OPTIONS.filter((option) => option.value !== "PENDING" && option.value !== "BLANK");
const ORDER_LIMIT_OPTIONS = [200, 400, 600] as const;
const UNASSIGNED_DRIVER_FILTER_VALUE = "__UNASSIGNED__";

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  UNPAID: "Төлөөгүй",
  PAID: "Төлсөн",
};

const CARRYOVER_STATUSES = new Set(["BLANK", "PENDING", "CONFIRMED", "PACKED", "SHIPPED", "RETURNED"]);

function getStatusLabel(status: string): string {
  return STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

function getPaymentStatusLabel(status: string): string {
  return PAYMENT_STATUS_LABELS[status] ?? status;
}

function getStatusClass(status: string): string {
  return STATUS_OPTIONS.find((option) => option.value === status)?.className ?? "bg-slate-100 text-slate-700 border-slate-200";
}

function getTodayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function displayDate(isoDate: string): string {
  return isoDate.replace(/-/g, ".");
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  const datePart = `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
  const timePart = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  return `${datePart} ${timePart}`;
}

function formatDateOnly(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
}

function getOrderDisplayDateValue(order: OrderRow, normalizedFilterFromDate: string, normalizedFilterToDate: string): string {
  const todayLocal = getTodayLocal();
  const selectedEndDate = normalizedFilterToDate || normalizedFilterFromDate || todayLocal;
  const carryoverDisplayDate = selectedEndDate > todayLocal ? todayLocal : selectedEndDate;
  if (order.status === "RETURNED") {
    return carryoverDisplayDate;
  }
  return order.delivery?.timeSlot?.date
    ?? (CARRYOVER_STATUSES.has(order.status) ? carryoverDisplayDate : order.createdAt);
}

function normalizeMnPhone(value: string): string | null {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return null;

  const normalized = digits.startsWith("976") && digits.length === 11
    ? digits.slice(3)
    : digits;

  return /^\d{8}$/.test(normalized) ? normalized : null;
}

function parseAuditValue(raw: string | null): string {
  if (!raw) return "-";
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return Object.entries(parsed)
        .map(([key, value]) => `${key}: ${String(value)}`)
        .join(", ");
    }
  } catch {
    // Not JSON, return as-is.
  }

  return raw;
}

function formatAuditItems(raw: string | null): string {
  if (!raw) return "-";

  try {
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object" && Array.isArray((parsed as { items?: unknown[] }).items)
        ? (parsed as { items: unknown[] }).items
        : null;

    if (items) {
      const parts = items
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const name = typeof item.name === "string" && item.name.trim() ? item.name.trim() : "Бараа";
          const qty = Number(item.qty ?? 0);
          return Number.isFinite(qty) && qty > 0 ? `${name} - ${qty}ш` : name;
        })
        .filter(Boolean);

      return parts.length > 0 ? parts.join(", ") : "-";
    }
  } catch {
    return raw;
  }

  return raw;
}

function parseStockAuditPayload(raw: string | null): {
  driverId?: string | null;
  driverName?: string | null;
  reason?: string | null;
  items: string;
} | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    return {
      driverId: typeof (parsed as { driverId?: unknown }).driverId === "string" ? (parsed as { driverId: string }).driverId : null,
      driverName: typeof (parsed as { driverName?: unknown }).driverName === "string" ? (parsed as { driverName: string }).driverName : null,
      reason: typeof (parsed as { reason?: unknown }).reason === "string" ? (parsed as { reason: string }).reason : null,
      items: formatAuditItems(raw),
    };
  } catch {
    return null;
  }
}

function formatAuditItemEntry(item: unknown): string {
  if (!item || typeof item !== "object") return "Бараа";
  const entry = item as { name?: unknown; qty?: unknown; unitPrice?: unknown };
  const name = typeof entry.name === "string" && entry.name.trim() ? entry.name.trim() : "Бараа";
  const qty = Number(entry.qty ?? 0);
  const unitPrice = Number(entry.unitPrice ?? 0);
  const qtyText = Number.isFinite(qty) && qty > 0 ? ` - ${qty}ш` : "";
  const priceText = Number.isFinite(unitPrice) && unitPrice > 0 ? ` (${formatPrice(unitPrice)})` : "";
  return `${name}${qtyText}${priceText}`;
}

function formatItemChangeSummary(raw: string | null): string {
  if (!raw) return "-";

  try {
    const parsed = JSON.parse(raw) as {
      added?: unknown[];
      removed?: unknown[];
      updated?: Array<{ from?: unknown; to?: unknown }>;
    };

    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const parts: string[] = [];

      if (Array.isArray(parsed.added) && parsed.added.length > 0) {
        parts.push(`Нэмсэн: ${parsed.added.map(formatAuditItemEntry).join(", ")}`);
      }

      if (Array.isArray(parsed.removed) && parsed.removed.length > 0) {
        parts.push(`Устгасан: ${parsed.removed.map(formatAuditItemEntry).join(", ")}`);
      }

      if (Array.isArray(parsed.updated) && parsed.updated.length > 0) {
        parts.push(`Өөрчилсөн: ${parsed.updated.map((item) => `${formatAuditItemEntry(item.from)} -> ${formatAuditItemEntry(item.to)}`).join(", ")}`);
      }

      return parts.length > 0 ? parts.join(". ") : "-";
    }
  } catch {
    return formatAuditItems(raw);
  }

  return formatAuditItems(raw);
}

function getAuditLogTitle(log: OrderDetails["auditLogs"][number]): string {
  if (log.action === "STATUS_CHANGED" && String(log.newValue ?? "").toUpperCase() === "CANCELLED") {
    return "Цуцалсан";
  }

  switch (log.action) {
    case "CREATED":
      return "Захиалга бүртгэсэн";
    case "STATUS_CHANGED":
      return "Төлөв өөрчилсөн";
    case "PAYMENT_STATUS_CHANGED":
      return "Төлбөрийн төлөв өөрчилсөн";
    case "DRIVER_CHANGED":
      return "Жолооч шинэчилсэн";
    case "DRIVER_STOCK_DEDUCTED":
      return "Жолоочийн үлдэгдлээс хассан";
    case "DRIVER_STOCK_RESTORED":
      return "Жолоочийн үлдэгдэлд буцаасан";
    case "ADDRESS_CHANGED":
      return "Хаяг шинэчилсэн";
    case "NOTES_CHANGED":
      return "Тайлбар шинэчилсэн";
    case "NOTE_ADDED":
      return "Тэмдэглэл нэмсэн";
    case "ITEMS_CHANGED":
      return "Барааны жагсаалт шинэчилсэн";
    default:
      return log.action;
  }
}

function shouldShowAuditLog(log: OrderDetails["auditLogs"][number]): boolean {
  // Hide stock movement logs in order details history; status-change log is the source of truth.
  if (log.action === "DRIVER_STOCK_DEDUCTED" || log.action === "DRIVER_STOCK_RESTORED") {
    return false;
  }

  // Driver daily rollover is a system-maintenance event and should not clutter business-facing history.
  if (log.action === "DELIVERY_DATE_ROLLED_OVER") {
    return false;
  }

  return true;
}

function getAuditLogDetail(log: OrderDetails["auditLogs"][number]): string {
  switch (log.action) {
    case "CREATED": {
      const items = formatAuditItems(log.newValue);
      return items !== "-" ? `Бүртгэсэн бараа: ${items}` : "Шинэ захиалга үүсгэсэн";
    }
    case "STATUS_CHANGED":
      return `${getStatusLabel(log.oldValue ?? "") || "-"} -> ${getStatusLabel(log.newValue ?? "") || "-"}`;
    case "PAYMENT_STATUS_CHANGED":
      return `${getPaymentStatusLabel(log.oldValue ?? "") || "-"} -> ${getPaymentStatusLabel(log.newValue ?? "") || "-"}`;
    case "DRIVER_CHANGED":
      return `${log.oldValue?.trim() || "Хуваарилаагүй"} -> ${log.newValue?.trim() || "Хуваарилаагүй"}`;
    case "DRIVER_STOCK_DEDUCTED": {
      const payload = parseStockAuditPayload(log.newValue);
      const driverLabel = payload?.driverName?.trim() || "Жолооч";
      const items = payload?.items || formatAuditItems(log.newValue);
      return `${driverLabel}-с хассан: ${items}`;
    }
    case "DRIVER_STOCK_RESTORED": {
      const payload = parseStockAuditPayload(log.newValue);
      const driverLabel = payload?.driverName?.trim() || "Жолооч";
      const items = payload?.items || formatAuditItems(log.newValue);

      if (payload?.reason === "cancelled") {
        return `${driverLabel}-д цуцалсан тул буцаан нэмсэн: ${items}`;
      }

      if (payload?.reason === "driver_reassigned") {
        return `${driverLabel}-д жолооч солигдсон тул буцаан нэмсэн: ${items}`;
      }

      return `${driverLabel}-д буцаан нэмсэн: ${items}`;
    }
    case "ADDRESS_CHANGED":
      return `${log.oldValue?.trim() || "-"} -> ${log.newValue?.trim() || "-"}`;
    case "NOTES_CHANGED":
      return `${log.oldValue?.trim() || "-"} -> ${log.newValue?.trim() || "-"}`;
    case "NOTE_ADDED":
      return log.newValue?.trim() || "-";
    case "ITEMS_CHANGED":
      return formatItemChangeSummary(log.newValue);
    default:
      return `${parseAuditValue(log.oldValue)} -> ${parseAuditValue(log.newValue)}`;
  }
}

function autoResizeTextarea(el: HTMLTextAreaElement) {
  // Keep the field compact until content overflows, then grow to fit.
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

function getDriverOptionLabel(driver: DriverOption, index: number): string {
  const name = driver.name?.trim();
  return name || `Жолооч ${index + 1}`;
}

const DRIVER_NAME_COLOR_CLASSES = [
  "border-stone-200 bg-stone-100",
  "border-zinc-200 bg-zinc-100",
  "border-neutral-200 bg-neutral-100",
  "border-lime-200 bg-lime-100",
  "border-teal-200 bg-teal-100",
  "border-pink-200 bg-pink-100",
] as const;

function getDriverNameColorClass(driverId: string): string {
  let hash = 0;
  for (let i = 0; i < driverId.length; i += 1) {
    hash = (hash * 31 + driverId.charCodeAt(i)) >>> 0;
  }
  return DRIVER_NAME_COLOR_CLASSES[hash % DRIVER_NAME_COLOR_CLASSES.length];
}

function createRegistrationItem(): RegistrationItem {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    productId: "",
    qty: "1",
    linePrice: "",
  };
}

function normalizeRegistrationItems(items: RegistrationItem[]): RegistrationItem[] {
  const next = items.filter((item, index) => item.productId || index === 0);

  if (next.length === 0) {
    return [createRegistrationItem()];
  }

  const lastItem = next[next.length - 1];
  if (!lastItem.productId) {
    return next;
  }

  return [...next, createRegistrationItem()];
}

function sanitizeMoneyInput(value: string): string {
  return value.replace(/[^\d.]/g, "");
}

function formatMoneyWithComma(value: string | number): string {
  const numeric = typeof value === "number" ? value : Number(sanitizeMoneyInput(value));
  if (!Number.isFinite(numeric)) {
    return "";
  }

  return numeric.toLocaleString("en-US");
}

function parseMoneyNumber(value: string | number): number {
  const numeric = typeof value === "number" ? value : Number(sanitizeMoneyInput(value));
  return Number.isFinite(numeric) ? numeric : 0;
}

function showOrderErrorToast(error: unknown) {
  const message = error instanceof Error ? error.message : "Алдаа гарлаа";

  if (message.includes("Жолоочийн үлдэгдэлээс хэтэрсэн байна")) {
    toast.custom((t) => (
      <div
        className={`max-w-md rounded-lg border border-amber-500 bg-amber-50 px-3 py-2 text-sm text-amber-900 shadow-lg transition-all ${t.visible ? "animate-enter" : "animate-leave"}`}
      >
        <div className="flex items-center gap-2">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-yellow-300 text-yellow-900 font-bold">x</span>
          <span className="font-medium text-amber-900">{message}</span>
        </div>
      </div>
    ));
    return;
  }

  toast.error(message);
}

function useDebouncedValue<T>(value: T, delayMs = 350): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}

export default function OperatorOrdersPage() {
  const { data: session } = useSession();

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [savingRowId, setSavingRowId] = useState<string | null>(null);
  const [deletingRowId, setDeletingRowId] = useState<string | null>(null);
  const [detailsLoadingId, setDetailsLoadingId] = useState<string | null>(null);
  const [isDetailSaving, setIsDetailSaving] = useState(false);
  const [openDetails, setOpenDetails] = useState<OrderDetails | null>(null);
  const [detailsDraft, setDetailsDraft] = useState<OrderEditDraft | null>(null);
  const [draftItemQueries, setDraftItemQueries] = useState<Record<number, string>>({});
  const [activeDraftProductIndex, setActiveDraftProductIndex] = useState<number | null>(null);

  const [products, setProducts] = useState<ProductOption[]>([]);
  const [drivers, setDrivers] = useState<DriverOption[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);

  const [filterFromDate, setFilterFromDate] = useState<string>(getTodayLocal());
  const [filterToDate, setFilterToDate] = useState<string>(getTodayLocal());
  const [phoneSearch, setPhoneSearch] = useState("");
  const [addressSearch, setAddressSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [productFilterQuery, setProductFilterQuery] = useState("");
  const [driverFilter, setDriverFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [registeredProductFilter, setRegisteredProductFilter] = useState<string[]>([]);
  const [orderFetchLimit, setOrderFetchLimit] = useState<number>(200);
  const [isDateSortEnabled, setIsDateSortEnabled] = useState(false);
  const [dateSortDirection, setDateSortDirection] = useState<"desc" | "asc">("desc");

  const [registrationItems, setRegistrationItems] = useState<RegistrationItem[]>([createRegistrationItem()]);
  const [registrationProductQueries, setRegistrationProductQueries] = useState<Record<string, string>>({});
  const [activeRegistrationProductId, setActiveRegistrationProductId] = useState<string | null>(null);
  const [customerPhone, setCustomerPhone] = useState("");
  const [shippingAddress, setShippingAddress] = useState("");
  const [selectedDriverId, setSelectedDriverId] = useState("");
  const [newOrderStatus, setNewOrderStatus] = useState("");
  const [note, setNote] = useState("");

  const [pendingStatuses, setPendingStatuses] = useState<Record<string, string>>({});
  const [pendingDriverIds, setPendingDriverIds] = useState<Record<string, string>>({});
  const fromDateInputRef = useRef<HTMLInputElement | null>(null);
  const toDateInputRef = useRef<HTMLInputElement | null>(null);
  const latestFetchRequestRef = useRef(0);
  const fetchAbortRef = useRef<AbortController | null>(null);
  const didLoadMetaRef = useRef(false);
  const detailsCacheRef = useRef<Record<string, OrderDetails>>({});
  const [isProductDropdownOpen, setIsProductDropdownOpen] = useState(false);
  const [isDriverDropdownOpen, setIsDriverDropdownOpen] = useState(false);
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const productDropdownRef = useRef<HTMLDivElement | null>(null);
  const driverDropdownRef = useRef<HTMLDivElement | null>(null);
  const statusDropdownRef = useRef<HTMLDivElement | null>(null);

  const isAdmin = String(session?.user?.role ?? "").toUpperCase() === "ADMIN";

  const registrationLineItems = useMemo(() => {
    return registrationItems.map((item) => {
      const product = products.find((entry) => entry.id === item.productId);
      const numericQty = Number(item.qty);
      const safeQty = Number.isFinite(numericQty) && numericQty > 0 ? numericQty : 1;
      const numericLinePrice = Number(item.linePrice);
      const baseLinePrice = (product?.basePrice ?? 0) * safeQty;
      const safeLinePrice = Number.isFinite(numericLinePrice) && numericLinePrice >= 0
        ? numericLinePrice
        : baseLinePrice;

      return {
        ...item,
        product,
        safeQty,
        baseLinePrice,
        safeLinePrice,
      };
    });
  }, [products, registrationItems]);

  const registrationGrandTotal = useMemo(() => {
    return registrationLineItems
      .filter((item) => item.productId)
      .reduce((sum, item) => sum + item.safeLinePrice, 0);
  }, [registrationLineItems]);

  const allDriverFilterValues = useMemo(
    () => [UNASSIGNED_DRIVER_FILTER_VALUE, ...drivers.map((driver) => driver.id)],
    [drivers],
  );

  const isAllDriversSelected = useMemo(
    () => allDriverFilterValues.length > 0 && allDriverFilterValues.every((value) => driverFilter.includes(value)),
    [allDriverFilterValues, driverFilter],
  );

  const normalizedFilterFromDate = useMemo(() => (
    filterFromDate && filterToDate && filterFromDate > filterToDate
      ? filterToDate
      : filterFromDate
  ), [filterFromDate, filterToDate]);

  const normalizedFilterToDate = useMemo(() => (
    filterFromDate && filterToDate && filterFromDate > filterToDate
      ? filterFromDate
      : filterToDate
  ), [filterFromDate, filterToDate]);

  const filteredOrders = useMemo(() => {
    const filtered = orders.filter((order) => {
      const driverId = order.assignedTo?.id ?? order.delivery?.agent?.userId ?? "";
      const hasUnassignedDriverFilter = driverFilter.includes(UNASSIGNED_DRIVER_FILTER_VALUE);
      const matchesDriver = driverFilter.length === 0
        || isAllDriversSelected
        || (driverId ? driverFilter.includes(driverId) : hasUnassignedDriverFilter);
      const matchesStatus = statusFilter.length === 0 || statusFilter.includes(order.status);
      const matchesProduct = registeredProductFilter.length === 0 || order.items.some((item) => registeredProductFilter.includes(item.product.id));
      return matchesDriver && matchesStatus && matchesProduct;
    });

    if (!isDateSortEnabled) {
      return filtered.sort((a, b) => {
        const aCreated = new Date(a.createdAt).getTime();
        const bCreated = new Date(b.createdAt).getTime();
        return bCreated - aCreated;
      });
    }

    return filtered.sort((a, b) => {
      const aDate = new Date(getOrderDisplayDateValue(a, normalizedFilterFromDate, normalizedFilterToDate)).getTime();
      const bDate = new Date(getOrderDisplayDateValue(b, normalizedFilterFromDate, normalizedFilterToDate)).getTime();

      if (aDate === bDate) {
        const aCreated = new Date(a.createdAt).getTime();
        const bCreated = new Date(b.createdAt).getTime();
        return dateSortDirection === "asc" ? aCreated - bCreated : bCreated - aCreated;
      }

      return dateSortDirection === "asc" ? aDate - bDate : bDate - aDate;
    });
  }, [orders, driverFilter, isAllDriversSelected, statusFilter, registeredProductFilter, normalizedFilterFromDate, normalizedFilterToDate, isDateSortEnabled, dateSortDirection]);

  const productFilterOptions = useMemo<FilterProductOption[]>(() => {
    const map = new Map<string, string>();
    for (const order of orders) {
      for (const item of order.items) {
        if (!map.has(item.product.id)) {
          map.set(item.product.id, item.product.name);
        }
      }
    }

    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "mn"));
  }, [orders]);

  const visibleProductFilterOptions = useMemo(() => {
    const query = productFilterQuery.trim().toLowerCase();
    if (!query) return productFilterOptions;
    return productFilterOptions.filter((product) => product.name.toLowerCase().includes(query));
  }, [productFilterOptions, productFilterQuery]);

  const productFilterLabel = useMemo(() => {
    if (registeredProductFilter.length === 0) return "Бараа";
    if (registeredProductFilter.length === 1) {
      return productFilterOptions.find((product) => product.id === registeredProductFilter[0])?.name
        ?? products.find((product) => product.id === registeredProductFilter[0])?.name
        ?? "Бараа";
    }
    return `${registeredProductFilter.length} бараа сонгосон`;
  }, [productFilterOptions, products, registeredProductFilter]);

  const driverFilterLabel = useMemo(() => {
    if (isAllDriversSelected) return "Бүгд";
    if (driverFilter.length === 0) return "Жолооч";
    if (driverFilter.length === 1) {
      if (driverFilter[0] === UNASSIGNED_DRIVER_FILTER_VALUE) {
        return "Blank";
      }
      return drivers.find((driver) => driver.id === driverFilter[0])?.name ?? "Жолооч";
    }
    return `${driverFilter.length} жолооч сонгосон`;
  }, [driverFilter, drivers, isAllDriversSelected]);

  const statusFilterLabel = useMemo(() => {
    const allStatusValues = STATUS_OPTIONS.map((option) => option.value);
    const isAllStatusesSelected = allStatusValues.length > 0
      && allStatusValues.every((value) => statusFilter.includes(value));

    if (isAllStatusesSelected) return "Бүгд";
    if (statusFilter.length === 0) return "Төлөв";
    if (statusFilter.length === 1) {
      return STATUS_OPTIONS.find((option) => option.value === statusFilter[0])?.label ?? "Төлөв";
    }
    return `${statusFilter.length} төлөв сонгосон`;
  }, [statusFilter]);

  const debouncedPhoneSearch = useDebouncedValue(phoneSearch);
  const debouncedAddressSearch = useDebouncedValue(addressSearch);
  const debouncedProductSearch = useDebouncedValue(productSearch);

  const toOrderRow = useCallback((order: any): OrderRow => ({
    ...order,
    total: Number(order.total),
  }), []);

  const upsertOrderRow = useCallback((order: any) => {
    const parsed = toOrderRow(order);
    setOrders((current) => {
      const index = current.findIndex((entry) => entry.id === parsed.id);
      if (index === -1) {
        return [parsed, ...current].slice(0, orderFetchLimit);
      }

      const next = [...current];
      next[index] = parsed;
      return next;
    });

    setPendingStatuses((current) => ({
      ...current,
      [parsed.id]: parsed.status,
    }));

    setPendingDriverIds((current) => ({
      ...current,
      [parsed.id]: parsed.assignedTo?.id ?? "",
    }));
  }, [orderFetchLimit, toOrderRow]);

  const isAbortError = useCallback((error: unknown) => {
    if (error instanceof DOMException) {
      return error.name === "AbortError";
    }

    if (typeof error === "object" && error !== null && "name" in error) {
      return (error as { name?: string }).name === "AbortError";
    }

    return false;
  }, []);

  const fetchData = useCallback(async () => {
    const requestId = ++latestFetchRequestRef.current;
    fetchAbortRef.current?.abort();
    const controller = new AbortController();
    fetchAbortRef.current = controller;

    setIsLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(orderFetchLimit), includeCount: "0" });
      if (normalizedFilterFromDate) params.set("fromDate", normalizedFilterFromDate);
      if (normalizedFilterToDate) params.set("toDate", normalizedFilterToDate);
      const selectedDriverIds = driverFilter.filter((driverId) => driverId !== UNASSIGNED_DRIVER_FILTER_VALUE);
      if (!isAllDriversSelected && selectedDriverIds.length > 0) {
        params.set("driverIds", selectedDriverIds.join(","));
      }
      if (statusFilter.length > 0) params.set("statuses", statusFilter.join(","));
      if (debouncedPhoneSearch.trim()) params.set("phone", debouncedPhoneSearch.trim());
      if (debouncedAddressSearch.trim()) params.set("address", debouncedAddressSearch.trim());
      if (debouncedProductSearch.trim()) params.set("product", debouncedProductSearch.trim());

      const shouldLoadMeta = !didLoadMetaRef.current;
      const metaPromise = shouldLoadMeta
        ? fetch("/api/orders/meta", { signal: controller.signal, cache: "no-store" }).catch((error) => {
            if (isAbortError(error)) {
              return null;
            }
            throw error;
          })
        : null;

      const ordersRes = await fetch(`/api/orders?${params.toString()}`, { signal: controller.signal, cache: "no-store" });

      if (!ordersRes.ok) {
        throw new Error("failed");
      }

      const ordersJson = await ordersRes.json();

      if (requestId !== latestFetchRequestRef.current || controller.signal.aborted) {
        return;
      }

      const parsedOrders = (ordersJson.data ?? []).map((order: any) => toOrderRow(order));
      setOrders(parsedOrders);

      const statusMap: Record<string, string> = {};
      const driverMap: Record<string, string> = {};
      parsedOrders.forEach((order: OrderRow) => {
        statusMap[order.id] = order.status;
        driverMap[order.id] = order.assignedTo?.id ?? "";
      });
      setPendingStatuses(statusMap);
      setPendingDriverIds(driverMap);

      if (metaPromise) {
        const metaRes = await metaPromise;
        if (!metaRes) {
          return;
        }
        if (!metaRes.ok) {
          throw new Error("failed");
        }

        if (requestId !== latestFetchRequestRef.current || controller.signal.aborted) {
          return;
        }

        const metaJson = await metaRes.json();
        const parsedProducts = (metaJson.products ?? []).map((product: any) => ({
          id: product.id,
          name: product.name,
          basePrice: Number(product.basePrice),
        }));

        const parsedDrivers = (metaJson.drivers ?? []).map((driver: any) => ({
          id: driver.id,
          name: driver.name,
        }));

        setProducts(parsedProducts);
        setDrivers(parsedDrivers);
        didLoadMetaRef.current = true;
      }
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }

      if (requestId === latestFetchRequestRef.current && !controller.signal.aborted) {
        toast.error("Захиалгын мэдээлэл уншихад алдаа гарлаа");
      }
    } finally {
      if (requestId === latestFetchRequestRef.current && !controller.signal.aborted) {
        setIsLoading(false);
      }
    }
  }, [
    normalizedFilterFromDate,
    normalizedFilterToDate,
    driverFilter,
    isAllDriversSelected,
    statusFilter,
    debouncedPhoneSearch,
    debouncedAddressSearch,
    debouncedProductSearch,
    orderFetchLimit,
    isAbortError,
    toOrderRow,
  ]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    return () => {
      fetchAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!openDetails) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        handleCloseDetails();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [openDetails]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (productDropdownRef.current && !productDropdownRef.current.contains(event.target as Node)) {
        setIsProductDropdownOpen(false);
      }

      if (driverDropdownRef.current && !driverDropdownRef.current.contains(event.target as Node)) {
        setIsDriverDropdownOpen(false);
      }

      if (!statusDropdownRef.current) return;
      if (!statusDropdownRef.current.contains(event.target as Node)) {
        setIsStatusDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const lastComputedItemsRef = useRef<string>("");

  useEffect(() => {
    if (!detailsDraft || products.length === 0) {
      return;
    }

    const itemsSignature = detailsDraft.items.map((i) => `${i.productId}:${i.unitPrice}`).join("|");
    
    if (itemsSignature === lastComputedItemsRef.current) {
      return;
    }

    let needsUpdate = false;
    const updatedItems = detailsDraft.items.map((item) => {
      if (item.productId && !item.unitPrice) {
        const selected = products.find((product) => product.id === item.productId);
        if (selected) {
          needsUpdate = true;
          return {
            ...item,
            unitPrice: String(selected.basePrice),
          };
        }
      }
      return item;
    });

    if (needsUpdate) {
      const newItemsSignature = updatedItems.map((i) => `${i.productId}:${i.unitPrice}`).join("|");
      lastComputedItemsRef.current = newItemsSignature;
      setDetailsDraft({
        ...detailsDraft,
        items: updatedItems,
      });
    } else {
      lastComputedItemsRef.current = itemsSignature;
    }
  }, [detailsDraft, products]);

  const handleCreateOrder = async () => {
    const filledItems = registrationItems.filter((item) => item.productId);

    if (filledItems.length === 0) {
      toast.error("Бараа сонгоно уу");
      return;
    }

    const normalizedCustomerPhone = normalizeMnPhone(customerPhone);
    if (!normalizedCustomerPhone) {
      toast.error("Утасны дугаар дутуу бичигдсэн байна");
      return;
    }

    const normalizedItems = filledItems.map((item) => {
      const numericQty = Number(item.qty);
      const product = products.find((entry) => entry.id === item.productId);
      const numericLinePrice = Number(item.linePrice);
      const fallbackLinePrice = (product?.basePrice ?? 0) * numericQty;
      const linePrice = Number.isFinite(numericLinePrice) && numericLinePrice >= 0
        ? numericLinePrice
        : fallbackLinePrice;

      return {
        productId: item.productId,
        qty: numericQty,
        linePrice,
        unitPrice: numericQty > 0 ? linePrice / numericQty : 0,
      };
    });

    if (normalizedItems.some((item) => !Number.isFinite(item.qty) || item.qty <= 0)) {
      toast.error("Тоо ширхэг зөв оруулна уу");
      return;
    }

    if (normalizedItems.some((item) => item.linePrice < 0)) {
      toast.error("Сонгосон бараа олдсонгүй");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          customer: {
            name: "Харилцагч",
            phone: normalizedCustomerPhone,
            address: shippingAddress.trim() || undefined,
          },
          items: normalizedItems.map((item) => ({
            productId: item.productId,
            qty: item.qty,
            unitPrice: item.unitPrice,
          })),
          assignedDriverId: selectedDriverId || undefined,
          notes: note.trim(),
          deliveryFee: 0,
          discount: 0,
          status: newOrderStatus || undefined,
          paymentStatus: "UNPAID",
        }),
      });

      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error ?? "Захиалга хадгалах үед алдаа гарлаа");
      }

      upsertOrderRow(json);
      toast.success("Захиалга амжилттай хадгалагдлаа");
      setRegistrationItems([createRegistrationItem()]);
      setRegistrationProductQueries({});
      setActiveRegistrationProductId(null);
      setCustomerPhone("");
      setShippingAddress("");
      setSelectedDriverId("");
      setNewOrderStatus("");
      setNote("");
    } catch (error) {
      showOrderErrorToast(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveRow = async (orderId: string) => {
    const nextStatus = pendingStatuses[orderId];
    const nextDriverId = pendingDriverIds[orderId] ?? "";
    const current = orders.find((order) => order.id === orderId);
    const currentDriverId = current?.assignedTo?.id ?? "";

    if (!nextStatus || !current || (nextStatus === current.status && nextDriverId === currentDriverId)) {
      return;
    }

    setSavingRowId(orderId);
    try {
      const payload: Record<string, string | null> = {};
      if (nextStatus !== current.status) {
        payload.status = nextStatus;
      }
      if (nextDriverId !== currentDriverId) {
        payload.assignedDriverId = nextDriverId || null;
      }

      const response = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error ?? "Төлөв шинэчлэх үед алдаа гарлаа");
      }

      upsertOrderRow(json);
      delete detailsCacheRef.current[orderId];
      toast.success("Төлөв шинэчлэгдлээ");
    } catch (error) {
      showOrderErrorToast(error);
    } finally {
      setSavingRowId(null);
    }
  };

  const handleSaveRowWithValues = async (orderId: string, newStatus: string, newDriverId: string) => {
    const current = orders.find((order) => order.id === orderId);
    const currentDriverId = current?.assignedTo?.id ?? "";

    if (!newStatus || !current || (newStatus === current.status && newDriverId === currentDriverId)) {
      return;
    }

    setSavingRowId(orderId);
    try {
      const payload: Record<string, string | null> = {};
      if (newStatus !== current.status) {
        payload.status = newStatus;
      }
      if (newDriverId !== currentDriverId) {
        payload.assignedDriverId = newDriverId || null;
      }

      const response = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error ?? "Төлөв шинэчлэх үед алдаа гарлаа");
      }

      upsertOrderRow(json);
      delete detailsCacheRef.current[orderId];
      toast.success("Төлөв шинэчлэгдлээ");
    } catch (error) {
      showOrderErrorToast(error);
    } finally {
      setSavingRowId(null);
    }
  };

  const handleDelete = async (orderId: string) => {
    if (!isAdmin) {
      toast.error("Зөвхөн админ устгах эрхтэй");
      return;
    }

    const confirmed = window.confirm("Энэ захиалгыг устгах уу?");
    if (!confirmed) {
      return;
    }

    setDeletingRowId(orderId);
    try {
      const response = await fetch(`/api/orders/${orderId}`, {
        method: "DELETE",
      });

      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error ?? "Устгах үед алдаа гарлаа");
      }

      setOrders((current) => current.filter((order) => order.id !== orderId));
      setPendingStatuses((current) => {
        const next = { ...current };
        delete next[orderId];
        return next;
      });
      setPendingDriverIds((current) => {
        const next = { ...current };
        delete next[orderId];
        return next;
      });
      delete detailsCacheRef.current[orderId];
      toast.success("Захиалга устгагдлаа");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Алдаа гарлаа");
    } finally {
      setDeletingRowId(null);
    }
  };

  const handleOpenDetails = async (orderId: string) => {
    const cached = detailsCacheRef.current[orderId];
    if (cached) {
      setOpenDetails(cached);
      setDetailsDraft({
        customerPhone: cached.customer.phone || "",
        shippingAddress: cached.shippingAddress || cached.customer.address || "",
        assignedDriverId: cached.assignedTo?.id ?? "",
        status: cached.status,
        paymentStatus: cached.paymentStatus,
        notes: cached.notes || "",
        items: cached.items.map((item) => ({
          id: item.id,
          productId: item.product.id,
          qty: String(item.qty),
          unitPrice: String(Number(item.unitPrice)),
        })),
      });
      const cachedQueries: Record<number, string> = {};
      cached.items.forEach((item, index) => {
        cachedQueries[index] = item.product.name;
      });
      setDraftItemQueries(cachedQueries);
      return;
    }

    setDetailsLoadingId(orderId);
    try {
      const response = await fetch(`/api/orders/${orderId}`);
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error ?? "Дэлгэрэнгүй мэдээлэл авахад алдаа гарлаа");
      }
      const orderDetails = json as OrderDetails;
      detailsCacheRef.current[orderId] = orderDetails;
      setOpenDetails(orderDetails);
      setDetailsDraft({
        customerPhone: orderDetails.customer.phone || "",
        shippingAddress: orderDetails.shippingAddress || orderDetails.customer.address || "",
        assignedDriverId: orderDetails.assignedTo?.id ?? "",
        status: orderDetails.status,
        paymentStatus: orderDetails.paymentStatus,
        notes: orderDetails.notes || "",
        items: orderDetails.items.map((item) => ({
          id: item.id,
          productId: item.product.id,
          qty: String(item.qty),
          unitPrice: String(Number(item.unitPrice)),
        })),
      });
      const nextQueries: Record<number, string> = {};
      orderDetails.items.forEach((item, index) => {
        nextQueries[index] = item.product.name;
      });
      setDraftItemQueries(nextQueries);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Алдаа гарлаа");
    } finally {
      setDetailsLoadingId(null);
    }
  };

  const handleResetFilters = () => {
    const today = getTodayLocal();
    setFilterFromDate(today);
    setFilterToDate(today);
    setPhoneSearch("");
    setAddressSearch("");
    setProductSearch("");
    setProductFilterQuery("");
    setDriverFilter([]);
    setStatusFilter([]);
    setRegisteredProductFilter([]);
  };

  const selectAllDrivers = () => {
    setDriverFilter(isAllDriversSelected ? [] : allDriverFilterValues);
  };

  const selectAllStatuses = () => {
    const allStatuses = STATUS_OPTIONS.map((option) => option.value);
    const areAllSelected = allStatuses.length > 0 && allStatuses.every((value) => statusFilter.includes(value));
    setStatusFilter(areAllSelected ? [] : allStatuses);
  };

  const handleCloseDetails = () => {
    setOpenDetails(null);
    setDetailsDraft(null);
    setDraftItemQueries({});
    setActiveDraftProductIndex(null);
    setIsDetailSaving(false);
  };

  const toggleStatusFilter = (statusValue: string) => {
    setStatusFilter((current) => {
      if (current.includes(statusValue)) {
        return current.filter((value) => value !== statusValue);
      }

      return [...current, statusValue];
    });
  };

  const toggleProductFilter = (productId: string) => {
    setRegisteredProductFilter((current) => {
      if (current.includes(productId)) {
        return current.filter((value) => value !== productId);
      }

      return [...current, productId];
    });
  };

  const selectAllProducts = () => {
    setRegisteredProductFilter([]);
  };

  const toggleDriverFilter = (driverId: string) => {
    setDriverFilter((current) => {
      if (current.includes(driverId)) {
        return current.filter((value) => value !== driverId);
      }

      return [...current, driverId];
    });
  };

  const handleDraftItemChange = (index: number, field: keyof OrderDraftItem, value: string) => {
    setDetailsDraft((current) => {
      if (!current) return current;
      const items = [...current.items];
      items[index] = {
        ...items[index],
        [field]: field === "unitPrice" ? sanitizeMoneyInput(value) : value,
      };

      if (field === "productId") {
        const selected = products.find((product) => product.id === value);
        if (selected) {
          items[index].unitPrice = String(selected.basePrice);
        }
      }

      return { ...current, items };
    });
  };

  const handleDraftProductQueryChange = (index: number, query: string) => {
    setDraftItemQueries((current) => ({ ...current, [index]: query }));
    const normalized = query.trim().toLowerCase();
    const matched = products.find((product) => product.name.trim().toLowerCase() === normalized);
    handleDraftItemChange(index, "productId", matched?.id ?? "");
  };

  const handleSelectDraftProduct = (index: number, product: ProductOption) => {
    setDraftItemQueries((current) => ({ ...current, [index]: product.name }));
    handleDraftItemChange(index, "productId", product.id);
    setActiveDraftProductIndex(null);
  };

  const handleDraftItemTotalChange = (index: number, value: string) => {
    setDetailsDraft((current) => {
      if (!current) return current;

      const items = [...current.items];
      const currentItem = items[index];
      if (!currentItem) return current;

      const totalValue = parseMoneyNumber(value);
      const safeTotal = totalValue >= 0 ? totalValue : 0;
      const qtyValue = Number(currentItem.qty || 0);
      const safeQty = Number.isFinite(qtyValue) && qtyValue > 0 ? qtyValue : 1;

      items[index] = {
        ...currentItem,
        unitPrice: String(safeTotal / safeQty),
      };

      return { ...current, items };
    });
  };

  const handleAddDraftItem = () => {
    setDetailsDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        items: [...current.items, { productId: "", qty: "1", unitPrice: "" }],
      };
    });
    setDraftItemQueries((current) => ({ ...current, [Object.keys(current).length]: "" }));
  };

  const handleRemoveDraftItem = (index: number) => {
    setDetailsDraft((current) => {
      if (!current) return current;
      const nextItems = current.items.filter((_, itemIndex) => itemIndex !== index);
      return {
        ...current,
        items: nextItems.length > 0 ? nextItems : [{ productId: "", qty: "1", unitPrice: "" }],
      };
    });
    setDraftItemQueries((current) => {
      const next: Record<number, string> = {};
      let nextIndex = 0;
      Object.keys(current)
        .map(Number)
        .sort((a, b) => a - b)
        .forEach((key) => {
          if (key === index) return;
          next[nextIndex] = current[key] ?? "";
          nextIndex += 1;
        });
      return next;
    });
  };

  const detailsDraftTotal = useMemo(() => {
    if (!detailsDraft) return 0;
    return detailsDraft.items.reduce((sum, item) => {
      const unitPriceValue = parseMoneyNumber(item.unitPrice || 0);
      const qtyValue = Number(item.qty || 0);
      const safeUnitPrice = Number.isFinite(unitPriceValue) ? unitPriceValue : 0;
      const safeQty = Number.isFinite(qtyValue) ? qtyValue : 0;
      return sum + safeUnitPrice * safeQty;
    }, 0);
  }, [detailsDraft]);

  const handleSaveDriverOrStatus = async () => {
    if (!openDetails || !detailsDraft) {
      return;
    }

    setIsDetailSaving(true);
    try {
      const response = await fetch(`/api/orders/${openDetails.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          assignedDriverId: detailsDraft.assignedDriverId || null,
          status: detailsDraft.status,
        }),
      });

      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error ?? "Жолооч/төлөв шинэчлэхэд алдаа гарлаа");
      }

      upsertOrderRow(json);
      delete detailsCacheRef.current[openDetails.id];
    } catch (error) {
      showOrderErrorToast(error);
    } finally {
      setIsDetailSaving(false);
    }
  };

  const handleSaveDetails = async () => {
    if (!openDetails || !detailsDraft) {
      return;
    }

    const normalizedItems = detailsDraft.items
      .map((item) => ({
        id: item.id,
        productId: item.productId,
        qty: Number(item.qty || 0),
        unitPrice: parseMoneyNumber(item.unitPrice || 0),
      }))
      .filter((item) => item.productId && Number.isFinite(item.qty) && item.qty > 0 && Number.isFinite(item.unitPrice) && item.unitPrice >= 0);

    if (normalizedItems.length === 0) {
      toast.error("Дор хаяж нэг бараа сонгоно уу");
      return;
    }

    const normalizedPhone = normalizeMnPhone(detailsDraft.customerPhone);
    if (!normalizedPhone) {
      toast.error("Утасны дугаар дутуу бичигдсэн байна");
      return;
    }

    setIsDetailSaving(true);
    try {
      const response = await fetch(`/api/orders/${openDetails.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          customerPhone: normalizedPhone,
          shippingAddress: detailsDraft.shippingAddress.trim(),
          assignedDriverId: detailsDraft.assignedDriverId || null,
          status: detailsDraft.status,
          paymentStatus: detailsDraft.paymentStatus,
          notes: detailsDraft.notes.trim(),
          items: normalizedItems,
        }),
      });

      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error ?? "Захиалга шинэчлэх үед алдаа гарлаа");
      }

      upsertOrderRow(json);
      delete detailsCacheRef.current[openDetails.id];
      toast.success("Захиалга шинэчлэгдлээ");
      handleCloseDetails();
    } catch (error) {
      showOrderErrorToast(error);
    } finally {
      setIsDetailSaving(false);
    }
  };

  const handleDateFieldClick = (input: HTMLInputElement | null) => {
    if (!input) return;
    input.focus();
    if (typeof input.showPicker === "function") {
      input.showPicker();
    }
  };

  const handleRegistrationProductChange = (itemId: string, nextProductId: string) => {
    setRegistrationItems((current) => {
      const updated = current.map((item) => (
        item.id === itemId
          ? {
              ...item,
              productId: nextProductId,
              qty: nextProductId ? item.qty || "1" : "1",
              linePrice: nextProductId
                ? String((products.find((product) => product.id === nextProductId)?.basePrice ?? 0) * Number(item.qty || "1"))
                : "",
            }
          : item
      ));

      return normalizeRegistrationItems(updated);
    });
  };

  const handleRegistrationProductQueryChange = (itemId: string, query: string) => {
    setRegistrationProductQueries((current) => ({ ...current, [itemId]: query }));
    const normalized = query.trim().toLowerCase();
    const matched = products.find((product) => product.name.trim().toLowerCase() === normalized);

    if (matched) {
      handleRegistrationProductChange(itemId, matched.id);
      return;
    }

    if (!normalized) {
      handleRegistrationProductChange(itemId, "");
    }
  };

  const handleSelectRegistrationProduct = (itemId: string, product: ProductOption) => {
    setRegistrationProductQueries((current) => ({ ...current, [itemId]: product.name }));
    handleRegistrationProductChange(itemId, product.id);
    setActiveRegistrationProductId(null);
  };

  const handleRegistrationQtyChange = (itemId: string, nextQty: string) => {
    setRegistrationItems((current) => current.map((item) => {
      if (item.id !== itemId) {
        return item;
      }

      const product = products.find((entry) => entry.id === item.productId);
      const numericQty = Number(nextQty);
      const safeQty = Number.isFinite(numericQty) && numericQty > 0 ? numericQty : 1;

      return {
        ...item,
        qty: nextQty,
        linePrice: item.productId ? String((product?.basePrice ?? 0) * safeQty) : "",
      };
    }));
  };

  const handleRegistrationUnitPriceChange = (itemId: string, nextUnitPrice: string) => {
    setRegistrationItems((current) => current.map((item) => (
      item.id === itemId ? { ...item, linePrice: sanitizeMoneyInput(nextUnitPrice) } : item
    )));
  };

  return (
    <div>
      <Header title="Захиалга" showSearch={false} />

      <div className="p-5 space-y-4">
        <div id="order-registration">
          <Card padding="none">
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-2">
              <h2 className="text-sm font-semibold text-slate-700">Захиалга бүртгэх</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-[1360px] w-full table-fixed text-sm">
                <colgroup>
                  <col className="w-[82px]" />
                  <col className="w-[94px]" />
                  <col className="w-[250px]" />
                  <col className="w-[270px]" />
                  <col className="w-[72px]" />
                  <col className="w-[106px]" />
                  <col className="w-[126px]" />
                  <col className="w-[128px]" />
                  <col className="w-[164px]" />
                  <col className="w-[84px]" />
                </colgroup>
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                    <th className="px-2 py-2 text-left">Огноо</th>
                    <th className="px-2 py-2 text-left">Дугаар</th>
                    <th className="px-2 py-2 text-left">Хаяг</th>
                    <th className="px-2 py-2 text-left">Бараа</th>
                    <th className="px-2 py-2 text-left">Тоо</th>
                    <th className="px-2 py-2 text-left">Үнэ / Нийт</th>
                    <th className="px-2 py-2 text-left">Жолооч</th>
                    <th className="px-2 py-2 text-left">Төлөв</th>
                    <th className="px-2 py-2 text-left">Тайлбар</th>
                    <th className="px-2 py-2 text-center"></th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-slate-100 bg-blue-50 align-top">
                    <td className="px-2 pt-2.5 pb-1.5 align-top text-slate-700 whitespace-nowrap">{displayDate(getTodayLocal())}</td>
                    <td className="px-2 py-1.5 align-top">
                      <input
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                        placeholder="Дугаар"
                        className={`${INPUT_CLASS} !w-[10ch] px-1.5`}
                      />
                    </td>
                    <td className="px-2 py-1.5 align-top">
                      <textarea
                        value={shippingAddress}
                        onChange={(e) => {
                          setShippingAddress(e.target.value);
                          autoResizeTextarea(e.currentTarget);
                        }}
                        onInput={(e) => autoResizeTextarea(e.currentTarget)}
                        placeholder="Хаяг"
                        rows={1}
                        className={`${INPUT_CLASS} min-h-[36px] resize-none overflow-hidden whitespace-pre-wrap break-words`}
                      />
                    </td>
                    <td className="px-2 py-1.5 align-top">
                      <div className="space-y-2">
                        {registrationItems.map((item) => (
                          <div key={item.id} className="relative">
                            <input
                              type="text"
                              value={registrationProductQueries[item.id] ?? products.find((product) => product.id === item.productId)?.name ?? ""}
                              onFocus={() => setActiveRegistrationProductId(item.id)}
                              onBlur={() => {
                                window.setTimeout(() => {
                                  setActiveRegistrationProductId((current) => (current === item.id ? null : current));
                                }, 120);
                              }}
                              onChange={(e) => handleRegistrationProductQueryChange(item.id, e.target.value)}
                              placeholder="Бараа сонгох / хайх"
                              className={INPUT_CLASS}
                            />

                            {activeRegistrationProductId === item.id && (
                              <div className="relative z-30 mt-1 w-full min-h-[108px] max-h-[132px] overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
                                {products
                                  .filter((product) => {
                                    const query = (registrationProductQueries[item.id] ?? "").trim().toLowerCase();
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
                                        handleSelectRegistrationProduct(item.id, product);
                                      }}
                                      className="block w-full whitespace-normal break-words px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-blue-50"
                                    >
                                      {product.name}
                                    </button>
                                  ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="px-2 py-1.5 align-top">
                      <div className="space-y-2">
                        {registrationItems.map((item) => (
                          <input
                            key={item.id}
                            type="number"
                            min="1"
                            value={item.productId ? item.qty : ""}
                            placeholder={item.productId ? "Тоо" : "-"}
                            disabled={!item.productId}
                            onChange={(e) => handleRegistrationQtyChange(item.id, e.target.value)}
                            className={`${INPUT_CLASS} text-center disabled:bg-slate-100 disabled:text-slate-400`}
                          />
                        ))}
                      </div>
                    </td>
                    <td className="px-2 py-1.5 align-top">
                      <div className="space-y-2">
                        {registrationLineItems.map((item) => (
                          <div key={item.id} className="space-y-1">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={item.productId ? formatMoneyWithComma(item.linePrice) : ""}
                              placeholder={item.productId ? "Үнэ" : "-"}
                              disabled={!item.productId}
                              onChange={(e) => handleRegistrationUnitPriceChange(item.id, e.target.value)}
                              className={`${INPUT_CLASS} text-right disabled:bg-slate-100 disabled:text-slate-400`}
                            />
                          </div>
                        ))}
                        <input
                          type="text"
                          inputMode="decimal"
                          value={formatMoneyWithComma(registrationGrandTotal)}
                          readOnly
                          className="w-full rounded-md border border-blue-300 bg-blue-50 px-2 py-1.5 text-right text-sm font-semibold text-blue-700 focus:outline-none"
                        />
                      </div>
                    </td>
                    <td className="px-2 py-1.5 align-top">
                      <select
                        value={selectedDriverId}
                        onChange={(e) => setSelectedDriverId(e.target.value)}
                        className={INPUT_CLASS}
                      >
                        <option value="">Сонгох</option>
                        {drivers.map((driver, index) => (
                          <option key={driver.id} value={driver.id}>
                            {getDriverOptionLabel(driver, index)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1.5 align-top">
                      <select
                        value={newOrderStatus}
                        onChange={(e) => setNewOrderStatus(e.target.value)}
                        className={INPUT_CLASS}
                      >
                        <option value="">Сонгох</option>
                        {REGISTRATION_STATUS_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1.5 align-top">
                      <textarea
                        value={note}
                        onChange={(e) => {
                          setNote(e.target.value);
                          autoResizeTextarea(e.currentTarget);
                        }}
                        onInput={(e) => autoResizeTextarea(e.currentTarget)}
                        placeholder="Тайлбар"
                        rows={1}
                        className={`${INPUT_CLASS} min-h-[36px] resize-none overflow-hidden whitespace-pre-wrap break-words`}
                      />
                    </td>
                    <td className="px-2 py-1.5 align-top text-center">
                      <Button
                        type="button"
                        size="sm"
                        isLoading={isSubmitting}
                        onClick={handleCreateOrder}
                        className="rounded-full bg-green-600 px-4 text-white hover:bg-green-700 focus:ring-green-500"
                      >
                        Хадгалах
                      </Button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <Card padding="none">
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 flex flex-wrap items-center gap-3">
            <h2 className="text-sm font-semibold text-slate-700">Бүртгэгдсэн захиалга</h2>
            <div className="flex items-center gap-2 ml-2">
              <input
                ref={fromDateInputRef}
                type="date"
                value={filterFromDate}
                onChange={(e) => setFilterFromDate(e.target.value)}
                onClick={() => handleDateFieldClick(fromDateInputRef.current)}
                className="px-2 py-1 rounded-md border border-slate-200 bg-white text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-slate-400 text-xs">—</span>
              <input
                ref={toDateInputRef}
                type="date"
                value={filterToDate}
                onChange={(e) => setFilterToDate(e.target.value)}
                onClick={() => handleDateFieldClick(toDateInputRef.current)}
                className="px-2 py-1 rounded-md border border-slate-200 bg-white text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="min-h-[420px] overflow-x-auto overflow-y-visible">
            <table className="min-w-[1200px] w-full table-fixed text-sm">
              <colgroup>
                <col className="w-[40px]" />
                <col className="w-[95px]" />
                <col className="w-[125px]" />
                <col className="w-[360px]" />
                <col className="w-[150px]" />
                <col className="w-[75px]" />
                <col className="w-[110px]" />
                <col className="w-[130px]" />
                <col className="w-[135px]" />
                <col className="w-[140px]" />
                <col className="w-[120px]" />
              </colgroup>
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                  <th className="px-2 py-2 text-left">#</th>
                  <th className="px-2 py-2 text-left normal-case">
                    <button
                      type="button"
                      onClick={() => {
                        if (!isDateSortEnabled) {
                          setIsDateSortEnabled(true);
                          setDateSortDirection("desc");
                          return;
                        }
                        setDateSortDirection((current) => (current === "desc" ? "asc" : "desc"));
                      }}
                      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 ${isDateSortEnabled ? "border-slate-200 bg-white text-slate-600" : "border-slate-200 bg-slate-100 text-slate-500"}`}
                      title={isDateSortEnabled ? (dateSortDirection === "desc" ? "Огноогоор: ихээс бага" : "Огноогоор: багаас их") : "Огноогоор эрэмбэлэх"}
                    >
                      <span>Огноо</span>
                      <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isDateSortEnabled && dateSortDirection === "asc" ? "rotate-180" : ""}`} />
                    </button>
                  </th>
                  <th className="px-2 py-2 text-left normal-case">
                    <input
                      type="search"
                      value={phoneSearch}
                      onChange={(e) => setPhoneSearch(e.target.value)}
                      placeholder="Дугаар"
                      className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </th>
                  <th className="px-2 py-2 text-left normal-case">
                    <input
                      type="search"
                      value={addressSearch}
                      onChange={(e) => setAddressSearch(e.target.value)}
                      placeholder="Хаяг"
                      className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </th>
                  <th className="px-2 py-2 text-left normal-case">
                    <div className="relative" ref={productDropdownRef}>
                      <button
                        type="button"
                        onClick={() => {
                          setIsProductDropdownOpen((current) => !current);
                          setIsDriverDropdownOpen(false);
                          setIsStatusDropdownOpen(false);
                        }}
                        className="flex w-full items-center justify-between rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <span className="truncate text-left">{productFilterLabel}</span>
                        <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${isProductDropdownOpen ? "rotate-180" : ""}`} />
                      </button>

                      {isProductDropdownOpen && (
                        <div className="absolute left-0 top-[calc(100%+4px)] z-20 w-full min-w-[170px] max-h-[220px] overflow-y-auto rounded-md border border-slate-200 bg-white p-1 shadow-lg">
                          <div className="px-1 pb-1">
                            <input
                              type="search"
                              value={productFilterQuery}
                              onChange={(e) => setProductFilterQuery(e.target.value)}
                              placeholder="Бараа"
                              className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                          {visibleProductFilterOptions.length === 0 ? (
                            <div className="px-2 py-2 text-[11px] text-slate-400">Бараа олдсонгүй</div>
                          ) : visibleProductFilterOptions.map((product) => {
                            const isSelected = registeredProductFilter.includes(product.id);
                            return (
                              <button
                                key={product.id}
                                type="button"
                                onClick={() => toggleProductFilter(product.id)}
                                className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[11px] text-slate-700 hover:bg-slate-100"
                              >
                                <span className={`inline-flex h-3.5 w-3.5 items-center justify-center rounded border ${isSelected ? "border-blue-500 bg-blue-500 text-white" : "border-slate-300 bg-white text-transparent"}`}>
                                  <Check className="h-3 w-3" />
                                </span>
                                <span className="truncate">{product.name}</span>
                              </button>
                            );
                          })}
                          <div className="my-1 border-t border-slate-200" />
                          <button
                            type="button"
                            onClick={selectAllProducts}
                            className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                          >
                            <span className="truncate">Бүгд</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </th>
                  <th className="px-2 py-2 text-center">Тоо</th>
                  <th className="px-2 py-2 text-center">Үнэ</th>
                  <th className="px-2 py-2 text-left normal-case">
                    <div className="relative" ref={driverDropdownRef}>
                      <button
                        type="button"
                        onClick={() => {
                          setIsDriverDropdownOpen((current) => !current);
                          setIsProductDropdownOpen(false);
                          setIsStatusDropdownOpen(false);
                        }}
                        className="flex w-full items-center justify-between rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <span className="truncate text-left">{driverFilterLabel}</span>
                        <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${isDriverDropdownOpen ? "rotate-180" : ""}`} />
                      </button>

                      {isDriverDropdownOpen && (
                        <div className="absolute left-0 top-[calc(100%+4px)] z-20 w-full min-w-[170px] rounded-md border border-slate-200 bg-white p-1 shadow-lg">
                          <button
                            key={UNASSIGNED_DRIVER_FILTER_VALUE}
                            type="button"
                            onClick={() => toggleDriverFilter(UNASSIGNED_DRIVER_FILTER_VALUE)}
                            className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[11px] text-slate-700 hover:bg-slate-100"
                          >
                            <span className={`inline-flex h-3.5 w-3.5 items-center justify-center rounded border ${driverFilter.includes(UNASSIGNED_DRIVER_FILTER_VALUE) ? "border-blue-500 bg-blue-500 text-white" : "border-slate-300 bg-white text-transparent"}`}>
                              <Check className="h-3 w-3" />
                            </span>
                            <span className="truncate">Blank</span>
                          </button>
                          {drivers.map((driver, index) => {
                            const isSelected = driverFilter.includes(driver.id);
                            return (
                              <button
                                key={driver.id}
                                type="button"
                                onClick={() => toggleDriverFilter(driver.id)}
                                className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[11px] text-slate-700 hover:bg-slate-100"
                              >
                                <span className={`inline-flex h-3.5 w-3.5 items-center justify-center rounded border ${isSelected ? "border-blue-500 bg-blue-500 text-white" : "border-slate-300 bg-white text-transparent"}`}>
                                  <Check className="h-3 w-3" />
                                </span>
                                <span className="truncate">{getDriverOptionLabel(driver, index)}</span>
                              </button>
                            );
                          })}
                          <div className="my-1 border-t border-slate-200" />
                          <button
                            type="button"
                            onClick={selectAllDrivers}
                            className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                          >
                            <span className="truncate">Бүгд</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </th>
                  <th className="px-2 py-2 text-left normal-case">
                    <div className="relative" ref={statusDropdownRef}>
                      <button
                        type="button"
                        onClick={() => {
                          setIsStatusDropdownOpen((current) => !current);
                          setIsProductDropdownOpen(false);
                          setIsDriverDropdownOpen(false);
                        }}
                        className="flex w-full items-center justify-between rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <span className="truncate text-left">{statusFilterLabel}</span>
                        <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${isStatusDropdownOpen ? "rotate-180" : ""}`} />
                      </button>

                      {isStatusDropdownOpen && (
                        <div className="absolute left-0 top-[calc(100%+4px)] z-20 w-full min-w-[170px] rounded-md border border-slate-200 bg-white p-1 shadow-lg">
                          {STATUS_OPTIONS.map((option) => {
                            const isSelected = statusFilter.includes(option.value);
                            return (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() => toggleStatusFilter(option.value)}
                                className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[11px] text-slate-700 hover:bg-slate-100"
                              >
                                <span className={`inline-flex h-3.5 w-3.5 items-center justify-center rounded border ${isSelected ? "border-blue-500 bg-blue-500 text-white" : "border-slate-300 bg-white text-transparent"}`}>
                                  <Check className="h-3 w-3" />
                                </span>
                                <span className="truncate">{option.label}</span>
                              </button>
                            );
                          })}
                          <div className="my-1 border-t border-slate-200" />
                          <button
                            type="button"
                            onClick={selectAllStatuses}
                            className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                          >
                            <span className="truncate">Бүгд</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </th>
                  <th className="px-2 py-2 text-left">Тайлбар</th>
                  <th className="px-2 py-2 text-center">
                    <Button type="button" variant="outline" size="sm" onClick={handleResetFilters}>
                      Цэвэрлэх
                    </Button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={11} className="px-3 py-10 text-center text-slate-400">Ачааллаж байна...</td>
                  </tr>
                ) : filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-3 py-10 text-center text-slate-400">Сонгосон ангилалд захиалга алга</td>
                  </tr>
                ) : (
                  filteredOrders.map((order, index) => {
                    const qtyTotal = order.items.reduce((sum, item) => sum + item.qty, 0);
                    const groupedProductMap = order.items.reduce((map, item) => {
                      const key = item.product.id;
                      const current = map.get(key);
                      if (current) {
                        current.qty += Number(item.qty ?? 0);
                        return map;
                      }

                      map.set(key, {
                        name: item.product.name,
                        qty: Number(item.qty ?? 0),
                      });
                      return map;
                    }, new Map<string, { name: string; qty: number }>());
                    const groupedProducts = Array.from(groupedProductMap.values());
                    const hasMultipleProductTypes = groupedProducts.length >= 2;
                    const productText = groupedProducts.length > 0
                      ? hasMultipleProductTypes
                        ? groupedProducts.map((item) => `${item.name} - ${item.qty}ш`).join("\n")
                        : `${groupedProducts[0].name} - ${groupedProducts[0].qty}ш`
                      : "-";
                    const productListTitle = groupedProducts.length > 0
                      ? groupedProducts.map((item) => `- ${item.name} - ${item.qty}ш`).join("\n")
                      : "-";
                    const nextStatus = pendingStatuses[order.id] ?? order.status;
                    const selectedDriverId = pendingDriverIds[order.id] ?? order.assignedTo?.id ?? "";
                    const orderDisplayDate = getOrderDisplayDateValue(order, normalizedFilterFromDate, normalizedFilterToDate);

                    return (
                      <tr key={order.id} className="border-b border-slate-100 hover:bg-blue-100 transition-colors">
                        <td className="px-2 py-1.5 text-slate-500">{index + 1}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap text-slate-700">{formatDateOnly(orderDisplayDate)}</td>
                        <td className="px-2 py-1.5 text-slate-700 whitespace-nowrap">{order.customer.phone}</td>
                        <td className="px-2 py-1.5 align-top text-slate-700 whitespace-pre-wrap break-words">{order.shippingAddress || order.customer.address || "-"}</td>
                        <td className={`px-2 py-1.5 text-slate-700 ${hasMultipleProductTypes ? "whitespace-pre-wrap break-words" : "truncate"}`} title={productListTitle}>{productText}</td>
                        <td className="px-2 py-1.5 text-center text-slate-700">{qtyTotal}</td>
                        <td className="px-2 py-1.5 text-right whitespace-nowrap">
                          <span
                            className={`inline-flex items-center justify-end rounded-md px-2 py-1 font-medium ${order.paymentStatus === "PAID" ? "border border-emerald-300 bg-emerald-50/60 text-emerald-800" : "text-slate-800"}`}
                            title={order.paymentStatus === "PAID" ? "Тооцоо орсон" : undefined}
                          >
                            {formatPrice(order.total)}
                          </span>
                        </td>
                        <td className="px-2 py-1.5">
                          <select
                            value={pendingDriverIds[order.id] ?? ""}
                            onChange={(e) => {
                              const newDriverId = e.target.value;
                              setPendingDriverIds((current) => ({ ...current, [order.id]: newDriverId }));
                              const currentStatus = pendingStatuses[order.id] ?? order.status;
                              handleSaveRowWithValues(order.id, currentStatus, newDriverId);
                            }}
                            className={`h-8 w-full rounded-full border px-2 py-0.5 text-xs font-semibold ${selectedDriverId
                              ? `${getDriverNameColorClass(selectedDriverId)} text-slate-800`
                              : "border-slate-200 bg-white text-slate-500 text-center"
                              }`}
                            disabled={savingRowId === order.id}
                          >
                            <option value="">-</option>
                            {drivers.map((driver, index) => (
                              <option key={driver.id} value={driver.id}>
                                {getDriverOptionLabel(driver, index)}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-1.5">
                          <select
                            value={nextStatus}
                            onChange={(e) => {
                              const newStatus = e.target.value;
                              setPendingStatuses((current) => ({ ...current, [order.id]: newStatus }));
                              const currentDriverId = pendingDriverIds[order.id] ?? "";
                              handleSaveRowWithValues(order.id, newStatus, currentDriverId);
                            }}
                            className={`h-8 w-full rounded-full border px-2 py-0.5 text-xs font-semibold ${getStatusClass(nextStatus)} ${nextStatus === "BLANK" ? "text-center" : ""}`}
                            disabled={savingRowId === order.id}
                          >
                            {STATUS_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.value === "BLANK" ? "-" : option.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-1.5 align-top text-slate-600 text-xs whitespace-pre-wrap break-words">{order.notes || "-"}</td>
                        <td className="px-2 py-1.5">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleOpenDetails(order.id)}
                              disabled={detailsLoadingId === order.id}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-blue-200 bg-blue-100 text-blue-700 disabled:opacity-50"
                              title="Дэлгэрэнгүй"
                            >
                              <Eye className="h-4 w-4" />
                            </button>

                            {isAdmin && (
                              <button
                                type="button"
                                onClick={() => handleDelete(order.id)}
                                disabled={deletingRowId === order.id}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-200 bg-red-100 text-red-700 disabled:opacity-50"
                                title="Устгах"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-600">
            <span>Харах мөрийн хэмжээ:</span>
            <select
              value={orderFetchLimit}
              onChange={(e) => setOrderFetchLimit(Number(e.target.value))}
              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {ORDER_LIMIT_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
        </Card>
      </div>

      {openDetails && detailsDraft && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-2"
        >
          <div
            className="flex max-h-[calc(100vh-16px)] w-full max-w-6xl flex-col overflow-hidden rounded-md border border-slate-300 bg-white shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-300 bg-slate-100 px-3 py-2.5">
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-medium text-slate-800">Захиалгын дэлгэрэнгүй /#{openDetails.orderNumber}/</h3>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-700">Бүртгэсэн: {formatDateTime(openDetails.createdAt)}</span>
                <button
                  type="button"
                  onClick={handleCloseDetails}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                  title="Хаах"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto bg-white px-3 py-2 text-[13px]">
              <div className="grid gap-1.5 lg:grid-cols-2">
                <div className="rounded-md border border-slate-300 bg-white p-2">
                  <div className="grid gap-1.5 md:grid-cols-[1fr_1fr_0.9fr]">
                    <label className="space-y-1">
                      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Утас</span>
                      <input
                        value={detailsDraft.customerPhone}
                        onChange={(e) => setDetailsDraft((current) => current ? { ...current, customerPhone: e.target.value } : current)}
                        className={`${INPUT_CLASS} !px-2 !py-1 text-[13px]`}
                      />
                    </label>

                    <label className="space-y-1">
                      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Жолооч</span>
                      <select
                        value={detailsDraft.assignedDriverId}
                        onChange={(e) => {
                          setDetailsDraft((current) => current ? { ...current, assignedDriverId: e.target.value } : current);
                        }}
                          className={`${INPUT_CLASS} !px-2 !py-1 text-[13px]`}
                        disabled={isDetailSaving}
                      >
                        <option value="">Сонгох</option>
                        {drivers.map((driver, index) => (
                          <option key={driver.id} value={driver.id}>
                            {getDriverOptionLabel(driver, index)}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="space-y-1">
                      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Төлөв</span>
                      <select
                        value={detailsDraft.status}
                        onChange={(e) => {
                          setDetailsDraft((current) => current ? { ...current, status: e.target.value } : current);
                        }}
                          className={`${INPUT_CLASS} !px-2 !py-1 text-[13px]`}
                        disabled={isDetailSaving}
                      >
                        {STATUS_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="mt-1.5 flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5">
                    <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                      <input
                        type="checkbox"
                        checked={detailsDraft.paymentStatus === "PAID"}
                        onChange={(e) => {
                          const nextChecked = e.target.checked;
                          setDetailsDraft((current) => current ? {
                            ...current,
                            paymentStatus: nextChecked ? "PAID" : "UNPAID",
                          } : current);
                        }}
                        className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                        disabled={isDetailSaving}
                      />
                      <span>Тооцоо орсон</span>
                    </label>
                    <span className={`text-xs font-semibold ${detailsDraft.paymentStatus === "PAID" ? "text-emerald-700" : "text-slate-500"}`}>
                      {detailsDraft.paymentStatus === "PAID" ? "Орсон" : "Ороогүй"}
                    </span>
                  </div>

                  <div className="mt-1.5 space-y-1.5">
                    <label className="block space-y-1">
                      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Хаяг</span>
                      <textarea
                        value={detailsDraft.shippingAddress}
                        onChange={(e) => setDetailsDraft((current) => current ? { ...current, shippingAddress: e.target.value } : current)}
                        rows={2}
                        className={`${INPUT_CLASS} min-h-[52px] resize-y whitespace-pre-wrap break-words`}
                      />
                    </label>
                  </div>
                </div>

                <div className="rounded-md border border-slate-300 bg-white p-2">
                  <div className="space-y-1.5">
                    <label className="block space-y-1">
                      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Тайлбар</span>
                      <textarea
                        value={detailsDraft.notes}
                        onChange={(e) => setDetailsDraft((current) => current ? { ...current, notes: e.target.value } : current)}
                        rows={2}
                        className={`${INPUT_CLASS} min-h-[52px] resize-y whitespace-pre-wrap break-words`}
                      />
                    </label>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleAddDraftItem}
                      disabled={isDetailSaving}
                      className="h-8 rounded-md border-slate-300 px-3 text-xs"
                    >
                      Бараа нэмэх
                    </Button>
                  </div>

                  <div className="px-0 py-1.5">
                    <div className="space-y-0.5">
                      <div className="grid grid-cols-[minmax(0,1fr)_56px_90px_90px_34px] gap-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        <span>Бараа</span>
                        <span className="text-center">Тоо</span>
                        <span className="text-right">Нэгж үнэ</span>
                        <span className="text-right">Нийт</span>
                        <span></span>
                      </div>

                      {detailsDraft.items.map((item, index) => {
                        const unitPriceValue = parseMoneyNumber(item.unitPrice || 0);
                        const qtyValue = Number(item.qty || 0);
                        const rowTotal = (Number.isFinite(unitPriceValue) ? unitPriceValue : 0) * (Number.isFinite(qtyValue) ? qtyValue : 0);

                        return (
                          <div key={`${item.id ?? "new"}-${index}`} className="grid grid-cols-[minmax(0,1fr)_56px_90px_90px_34px] items-center gap-1 rounded-md bg-transparent p-1">
                            <div className="relative">
                              <input
                                type="text"
                                value={draftItemQueries[index] ?? products.find((product) => product.id === item.productId)?.name ?? ""}
                                onFocus={() => setActiveDraftProductIndex(index)}
                                onBlur={() => {
                                  window.setTimeout(() => {
                                    setActiveDraftProductIndex((current) => (current === index ? null : current));
                                  }, 120);
                                }}
                                onChange={(e) => handleDraftProductQueryChange(index, e.target.value)}
                                placeholder="Бараа сонгох / хайх"
                                className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />

                              {activeDraftProductIndex === index && (
                                <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-44 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
                                  {products
                                    .filter((product) => {
                                      const query = (draftItemQueries[index] ?? "").trim().toLowerCase();
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
                                          handleSelectDraftProduct(index, product);
                                        }}
                                        className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-sm hover:bg-slate-100"
                                      >
                                        <span className="truncate text-slate-700">{product.name}</span>
                                        <span className="text-xs text-slate-400">{formatPrice(product.basePrice)}</span>
                                      </button>
                                    ))}
                                </div>
                              )}
                            </div>

                            <input
                              type="number"
                              min="1"
                              value={item.qty}
                              onChange={(e) => handleDraftItemChange(index, "qty", e.target.value)}
                              className="w-full rounded-md border border-slate-300 bg-white px-1.5 py-1 text-center text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />

                            <input
                              type="text"
                              inputMode="decimal"
                              value={formatMoneyWithComma(item.unitPrice)}
                              onChange={(e) => handleDraftItemChange(index, "unitPrice", e.target.value)}
                              className="w-full rounded-md border border-slate-300 bg-white px-1.5 py-1 text-right text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />

                            <input
                              type="text"
                              inputMode="decimal"
                              value={formatMoneyWithComma(Number.isFinite(rowTotal) ? rowTotal : 0)}
                              onChange={(e) => handleDraftItemTotalChange(index, e.target.value)}
                              className="w-full rounded-md border border-slate-300 bg-white px-1.5 py-1 text-right text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />

                            <Button type="button" variant="ghost" size="sm" className="h-7 w-7 px-0" onClick={() => handleRemoveDraftItem(index)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        );
                      })}

                      <div className="flex justify-end pt-0.5">
                        <div className="min-w-[240px] rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-right">
                          <div className="text-sm font-semibold text-blue-900">Нийт дүн: {formatPrice(detailsDraftTotal)}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-md border border-slate-300 bg-white p-2.5">
                <h4 className="mb-2 text-sm font-semibold text-slate-800">Өөрчлөлтийн түүх</h4>
                {openDetails.auditLogs.filter(shouldShowAuditLog).length === 0 ? (
                  <div className="rounded-md border border-slate-300 bg-slate-50 px-2.5 py-3 text-sm text-slate-500">Log байхгүй</div>
                ) : (
                  <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
                    {openDetails.auditLogs.filter(shouldShowAuditLog).map((log) => (
                      <div key={log.id} className="rounded-md border border-slate-300 bg-slate-50 px-2.5 py-2">
                        <div className="grid grid-cols-[150px_1fr_auto] items-start gap-2 text-xs">
                          <span className="text-slate-500">{formatDateTime(log.createdAt)}</span>
                          <span className="font-semibold text-slate-800">{getAuditLogTitle(log)}</span>
                          <span className="text-right text-slate-600">{log.user?.name ?? "system"}</span>
                        </div>
                        <div className="mt-1.5 text-sm text-slate-700 whitespace-pre-wrap break-words">{getAuditLogDetail(log)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>

            <div className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-300 bg-slate-50 px-3 py-2">
              <Button type="button" variant="outline" onClick={handleCloseDetails}>
                Болих
              </Button>
              <Button type="button" isLoading={isDetailSaving} onClick={handleSaveDetails}>
                <span>Хадгалах</span>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
