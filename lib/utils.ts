import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, formatDistanceToNow } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPrice(amount: number | string | null | undefined): string {
  if (amount == null) return "₮0";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return `₮${num.toLocaleString("mn-MN")}`;
}

export function formatDate(date: Date | string | null): string {
  if (!date) return "-";
  return format(new Date(date), "yyyy.MM.dd");
}

export function formatDateTime(date: Date | string | null): string {
  if (!date) return "-";
  return format(new Date(date), "yyyy.MM.dd HH:mm");
}

export function formatRelative(date: Date | string | null): string {
  if (!date) return "-";
  return formatDistanceToNow(new Date(date), { addSuffix: true });
}

export function generateOrderNumber(): string {
  const now = new Date();
  const year = now.getFullYear();
  const random = Math.floor(Math.random() * 99999)
    .toString()
    .padStart(5, "0");
  return `ORD-${year}-${random}`;
}

export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]+/g, "")
    .replace(/--+/g, "-")
    .trim();
}

export function truncate(str: string, length = 50): string {
  if (str.length <= length) return str;
  return str.slice(0, length) + "...";
}

export function getOrderStatusColor(status: string): string {
  const colors: Record<string, string> = {
    PENDING: "bg-yellow-100 text-yellow-800",
    CONFIRMED: "bg-blue-100 text-blue-800",
    PACKED: "bg-indigo-100 text-indigo-800",
    SHIPPED: "bg-purple-100 text-purple-800",
    POSTPONED: "bg-sky-100 text-sky-800",
    DELIVERED: "bg-green-100 text-green-800",
    LATE_DELIVERED: "bg-emerald-100 text-emerald-800",
    CANCELLED: "bg-red-100 text-red-800",
    RETURNED: "bg-gray-100 text-gray-800",
  };
  return colors[status] ?? "bg-gray-100 text-gray-800";
}

export function getPaymentStatusColor(status: string): string {
  const colors: Record<string, string> = {
    PAID: "bg-green-100 text-green-800",
    UNPAID: "bg-red-100 text-red-800",
    PARTIAL: "bg-yellow-100 text-yellow-800",
    REFUNDED: "bg-gray-100 text-gray-800",
  };
  return colors[status] ?? "bg-gray-100 text-gray-800";
}

export function getProductStatusColor(status: string): string {
  const colors: Record<string, string> = {
    ACTIVE: "bg-green-100 text-green-800",
    DRAFT: "bg-gray-100 text-gray-800",
    OUT_OF_STOCK: "bg-red-100 text-red-800",
  };
  return colors[status] ?? "bg-gray-100 text-gray-800";
}
