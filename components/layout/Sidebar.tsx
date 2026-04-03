"use client";

import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  ArrowLeftRight,
  LayoutDashboard,
  Package,
  PackageCheck,
  ShoppingCart,
  Truck,
  Users,
  Settings,
  ClipboardList,
  ShoppingBag,
  ChevronDown,
  LogOut,
  User,
  BarChart3,
  FileText,
} from "lucide-react";
import { useState } from "react";

interface NavItem {
  type: "item";
  href: string;
  label: string;
  icon: React.ReactNode;
  badge?: number;
}

interface NavSection {
  type: "section";
  label: string;
}

type AdminNavEntry = NavItem | NavSection;

const adminNav: AdminNavEntry[] = [
  { type: "item", href: "/admin", label: "Хянах самбар", icon: <LayoutDashboard className="w-4.5 h-4.5" /> },
  { type: "section", label: "Бараа" },
  { type: "item", href: "/admin/products", label: "Бараа бүтээгдэхүүн", icon: <Package className="w-4.5 h-4.5" /> },
  { type: "item", href: "/admin/stock", label: "Барааны үлдэгдэл", icon: <PackageCheck className="w-4.5 h-4.5" /> },
  { type: "item", href: "/admin/stock-movements", label: "Бараа бүтээгдэхүүний хөдөлгөөн", icon: <ArrowLeftRight className="w-4.5 h-4.5" /> },
  { type: "item", href: "/admin/orders", label: "Захиалга", icon: <ShoppingCart className="w-4.5 h-4.5" /> },
  { type: "item", href: "/admin/customers", label: "Харилцагч", icon: <Users className="w-4.5 h-4.5" /> },
  { type: "item", href: "/admin/settings", label: "Тохиргоо", icon: <Settings className="w-4.5 h-4.5" /> },
  { type: "section", label: "Тайлан" },
  { type: "item", href: "/admin/reports/driver", label: "Жолоочийн тайлан", icon: <BarChart3 className="w-4.5 h-4.5" /> },
  { type: "item", href: "/admin/reports/operator", label: "Операторын тайлан", icon: <FileText className="w-4.5 h-4.5" /> },
];

const operatorNav: NavItem[] = [
  { type: "item", href: "/operator", label: "Хянах самбар", icon: <LayoutDashboard className="w-4.5 h-4.5" /> },
  { type: "item", href: "/operator/orders", label: "Захиалга", icon: <ShoppingCart className="w-4.5 h-4.5" /> },
  { type: "item", href: "/admin/stock", label: "Барааны үлдэгдэл", icon: <PackageCheck className="w-4.5 h-4.5" /> },
  { type: "item", href: "/admin/stock-movements", label: "Бараа бүтээгдэхүүний хөдөлгөөн", icon: <ArrowLeftRight className="w-4.5 h-4.5" /> },
];

const driverNav: NavItem[] = [
  { type: "item", href: "/driver", label: "Тооцоо нийлэх", icon: <LayoutDashboard className="w-4.5 h-4.5" /> },
  { type: "item", href: "/driver/deliveries", label: "Миний хүргэлт", icon: <Truck className="w-4.5 h-4.5" /> },
  { type: "item", href: "/driver/stock", label: "Барааны үлдэгдэл", icon: <PackageCheck className="w-4.5 h-4.5" /> },
];

function getNavItems(role: string): AdminNavEntry[] {
  if (role === "ADMIN") return adminNav;
  if (role === "OPERATOR") return operatorNav;
  return driverNav;
}

function getRoleLabel(role: string) {
  const labels: Record<string, string> = {
    ADMIN: "Админ",
    OPERATOR: "Оператор",
    DRIVER: "Жолооч",
  };
  return labels[role] ?? role;
}

export default function Sidebar() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const role = session?.user?.role ?? "";
  const navItems = getNavItems(role);
  const productNavItems = new Set(["/admin/products", "/admin/stock", "/admin/stock-movements"]);
  const reportNavItems = new Set(["/admin/reports/driver", "/admin/reports/operator"]);

  const isActive = (href: string) => {
    if (href === "/admin" || href === "/operator" || href === "/driver") {
      return pathname === href;
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <aside className="h-full flex flex-col bg-white border-r border-slate-100 w-64 shrink-0">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-slate-100">
        <Link href="/" className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center shrink-0">
            <ShoppingBag className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="text-base font-bold text-slate-800">Arvis</span>
            <span className="text-base font-bold text-blue-600"> Shop</span>
            <p className="text-[10px] text-slate-400 -mt-0.5">Удирдлагын систем</p>
          </div>
        </Link>
      </div>

      {/* Role badge */}
      <div className="px-4 py-3">
        <div className="bg-blue-50 rounded-xl px-3 py-2 flex items-center gap-2">
          <div className="w-2 h-2 bg-blue-500 rounded-full" />
          <span className="text-xs font-medium text-blue-700">{getRoleLabel(role)}</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">
        {navItems.map((entry, idx) => {
          if (entry.type === "section") {
            return (
              <p key={`section-${idx}`} className="px-3 pt-3 pb-1 text-[10px] font-semibold text-slate-400 uppercase tracking-[0.18em]">
                {entry.label}
              </p>
            );
          }
          return (
            <Link
              key={entry.href}
              href={entry.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150",
                role === "ADMIN" && productNavItems.has(entry.href) && "ml-2 py-2 pl-5 text-[13px]",
                role === "ADMIN" && reportNavItems.has(entry.href) && "ml-2 py-2 pl-5 text-[13px]",
                isActive(entry.href)
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-800"
              )}
            >
              <span className={cn(isActive(entry.href) ? "text-white" : "text-slate-400")}>
                {entry.icon}
              </span>
              {entry.label}
              {entry.badge && (
                <span className="ml-auto bg-orange-500 text-white text-xs font-bold min-w-[20px] h-5 rounded-full flex items-center justify-center px-1">
                  {entry.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* User menu */}
      <div className="p-3 border-t border-slate-100">
        <div className="relative">
          <button
            onClick={() => setUserMenuOpen((v) => !v)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-100 transition-colors"
          >
            <div className="w-8 h-8 bg-blue-100 rounded-xl flex items-center justify-center shrink-0">
              <User className="w-4 h-4 text-blue-600" />
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-sm font-medium text-slate-800 truncate">
                {session?.user?.name}
              </p>
              <p className="text-xs text-slate-400 truncate">{session?.user?.email}</p>
            </div>
            <ChevronDown
              className={cn(
                "w-4 h-4 text-slate-400 transition-transform shrink-0",
                userMenuOpen && "rotate-180"
              )}
            />
          </button>

          {userMenuOpen && (
            <div className="absolute bottom-full left-0 right-0 mb-1 bg-white rounded-xl border border-slate-100 shadow-lg overflow-hidden">
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-600 hover:bg-red-50 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Гарах
              </button>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
