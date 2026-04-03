import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown } from "lucide-react";

interface StatsCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  trend?: {
    value: number;
    label: string;
  };
  color?: "blue" | "orange" | "green" | "purple" | "red";
  className?: string;
}

const colorStyles = {
  blue: {
    icon: "bg-blue-100 text-blue-600",
    border: "border-blue-100",
  },
  orange: {
    icon: "bg-orange-100 text-orange-600",
    border: "border-orange-100",
  },
  green: {
    icon: "bg-green-100 text-green-600",
    border: "border-green-100",
  },
  purple: {
    icon: "bg-purple-100 text-purple-600",
    border: "border-purple-100",
  },
  red: {
    icon: "bg-red-100 text-red-600",
    border: "border-red-100",
  },
};

export default function StatsCard({
  title,
  value,
  icon,
  trend,
  color = "blue",
  className,
}: StatsCardProps) {
  const styles = colorStyles[color];
  const isPositive = trend && trend.value >= 0;

  return (
    <div
      className={cn(
        "bg-white rounded-2xl border shadow-card p-5 flex items-start gap-4",
        styles.border,
        className
      )}
    >
      <div className={cn("p-3 rounded-xl shrink-0", styles.icon)}>{icon}</div>

      <div className="min-w-0 flex-1">
        <p className="text-sm text-slate-500 font-medium truncate">{title}</p>
        <p className="text-2xl font-bold text-slate-800 mt-0.5 leading-tight">{value}</p>
        {trend && (
          <div
            className={cn(
              "flex items-center gap-1 mt-1.5 text-xs font-medium",
              isPositive ? "text-green-600" : "text-red-600"
            )}
          >
            {isPositive ? (
              <TrendingUp className="w-3.5 h-3.5" />
            ) : (
              <TrendingDown className="w-3.5 h-3.5" />
            )}
            <span>
              {isPositive ? "+" : ""}
              {trend.value}% {trend.label}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
