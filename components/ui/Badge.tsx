import { cn } from "@/lib/utils";

type BadgeVariant =
  | "default"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "purple"
  | "orange"
  | "gray";

interface BadgeProps {
  variant?: BadgeVariant;
  className?: string;
  children: React.ReactNode;
  dot?: boolean;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: "bg-slate-100 text-slate-700",
  success: "bg-green-100 text-green-800",
  warning: "bg-yellow-100 text-yellow-800",
  danger: "bg-red-100 text-red-800",
  info: "bg-blue-100 text-blue-800",
  purple: "bg-purple-100 text-purple-800",
  orange: "bg-orange-100 text-orange-800",
  gray: "bg-gray-100 text-gray-700",
};

const dotStyles: Record<BadgeVariant, string> = {
  default: "bg-slate-500",
  success: "bg-green-500",
  warning: "bg-yellow-500",
  danger: "bg-red-500",
  info: "bg-blue-500",
  purple: "bg-purple-500",
  orange: "bg-orange-500",
  gray: "bg-gray-500",
};

export default function Badge({ variant = "default", className, children, dot }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium",
        variantStyles[variant],
        className
      )}
    >
      {dot && <span className={cn("w-1.5 h-1.5 rounded-full", dotStyles[variant])} />}
      {children}
    </span>
  );
}

// Utility to map status strings to badge variants
export function orderStatusBadge(status: string): BadgeVariant {
  const map: Record<string, BadgeVariant> = {
    BLANK: "default",
    PENDING: "warning",
    CONFIRMED: "info",
    PACKED: "purple",
    SHIPPED: "purple",
    POSTPONED: "info",
    DELIVERED: "success",
    LATE_DELIVERED: "success",
    CANCELLED: "danger",
    RETURNED: "gray",
  };
  return map[status] ?? "default";
}

export function paymentStatusBadge(status: string): BadgeVariant {
  const map: Record<string, BadgeVariant> = {
    PAID: "success",
    UNPAID: "danger",
    PARTIAL: "warning",
    REFUNDED: "gray",
  };
  return map[status] ?? "default";
}

export function productStatusBadge(status: string): BadgeVariant {
  const map: Record<string, BadgeVariant> = {
    ACTIVE: "success",
    DRAFT: "gray",
    OUT_OF_STOCK: "danger",
  };
  return map[status] ?? "default";
}
