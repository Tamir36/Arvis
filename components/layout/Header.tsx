"use client";

import { useState } from "react";
import { Search, Bell, Menu, X } from "lucide-react";
import Sidebar from "./Sidebar";

interface HeaderProps {
  title: string;
  subtitle?: string;
  showSearch?: boolean;
}

export default function Header({ title, subtitle, showSearch = true }: HeaderProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");

  return (
    <>
      <header className="bg-white border-b border-slate-100 sticky top-0 z-30">
        <div className="flex items-center gap-4 px-5 py-3.5">
          {/* Mobile menu toggle */}
          <button
            className="lg:hidden p-2 rounded-xl text-slate-500 hover:bg-slate-100 transition-colors"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Page title */}
          <div className="min-w-0">
            <h1 className="text-base font-semibold text-slate-800 leading-tight truncate">
              {title}
            </h1>
            {subtitle && (
              <p className="text-xs text-slate-400 mt-0.5 truncate">{subtitle}</p>
            )}
          </div>

          {/* Search */}
          {showSearch && (
            <div className="flex-1 max-w-md hidden sm:block">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="search"
                  value={searchValue}
                  onChange={(e) => setSearchValue(e.target.value)}
                  placeholder="Хайх..."
                  className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm
                    placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                    hover:border-slate-300 transition-all"
                />
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 ml-auto">
            <button className="relative p-2 rounded-xl text-slate-500 hover:bg-slate-100 transition-colors">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-orange-500 rounded-full" />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute left-0 top-0 bottom-0 w-64 shadow-2xl">
            <div className="absolute top-3 right-3 z-10">
              <button
                onClick={() => setMobileOpen(false)}
                className="p-2 rounded-xl bg-white/80 text-slate-500 hover:bg-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <Sidebar />
          </div>
        </div>
      )}
    </>
  );
}
