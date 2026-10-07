"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  LayoutDashboard, ClipboardList, Wrench, Truck, Scissors, History, Boxes,
  ClipboardCheck, UserCircle, ShoppingCart, Factory, Users, Package, PackageSearch,
  Banknote, Calculator, FileClock, Settings2, Sparkles, Contact, FileText, LogOut, Menu, X,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type NavItem = { href: string; label: string; icon?: string };

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  dashboard: LayoutDashboard, orders: ClipboardList, dispatch: Wrench, ship: Truck,
  cutlist: Scissors, history: History, inventory: Boxes, stockcount: ClipboardCheck,
  account: UserCircle, cart: ShoppingCart, products: Package, factory: Factory,
  users: Users, suppliers: Users, purchase: PackageSearch, reconcile: Banknote,
  pricing: Calculator, audit: FileClock, settings: Settings2,
};

/**
 * 暗色驾驶舱壳层：
 * - 桌面端固定左侧栏（分组 + 图标 + 激活辉光）
 * - 移动端顶栏 + 抽屉；dock=true（车间）时附底部 Dock，拇指可达
 */
export function Nav({
  items,
  secondaryItems = [],
  user,
  dock = false,
}: {
  items: NavItem[];
  secondaryItems?: NavItem[];
  user: { name: string; role: string };
  dock?: boolean;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isActive = (item: NavItem) =>
    pathname === item.href ||
    (item.href !== "/dealer" && item.href !== "/admin" && item.href !== "/workshop" && pathname.startsWith(item.href));

  const allItems = [...items, ...secondaryItems];

  const SideContent = (
    <>
      <Link href="/" className="group flex items-center gap-3 px-2">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 text-sm font-black text-slate-950 shadow-lg shadow-cyan-500/30 transition-transform group-hover:-rotate-3 group-hover:scale-105">
          P
        </span>
        <span className="leading-tight">
          <span className="block text-sm font-bold">Parti 加工履约</span>
          <span className="block text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">{user.role}端</span>
        </span>
      </Link>

      <div className="mt-6 flex flex-1 space-y-6 overflow-y-auto">
        <SideGroup label="作业" items={items} isActive={isActive} />
        {secondaryItems.length > 0 && <SideGroup label="管理" items={secondaryItems} isActive={isActive} />}
      </div>

      <div className="border-t border-border/70 pt-3">
        <div className="flex items-center justify-between px-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{user.name}</div>
            <div className="text-[11px] text-muted-foreground">{user.role}</div>
          </div>
          <button onClick={() => signOut({ callbackUrl: "/login" })}
            className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive" title="退出登录">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* 桌面侧栏 */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col gap-4 border-r border-border/70 bg-card/70 p-4 backdrop-blur-xl no-print lg:flex">
        {SideContent}
      </aside>

      {/* 移动端顶栏 */}
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur-xl no-print lg:hidden">
        <div className="flex min-h-14 items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-cyan-400 to-blue-600 text-xs font-black text-slate-950 shadow-md shadow-cyan-500/30">P</span>
            <span className="text-sm font-bold">Parti 加工履约</span>
          </Link>
          <div className="flex items-center gap-1">
            <span className="mr-1 text-xs text-muted-foreground">{user.name}</span>
            <button className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:bg-secondary" onClick={() => setOpen(true)} aria-label="菜单">
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      {/* 移动端抽屉 */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden no-print" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col gap-4 border-r border-border bg-card p-4 stagger-in" onClick={(e) => e.stopPropagation()}>
            <button className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-secondary" onClick={() => setOpen(false)}>
              <X className="h-4 w-4" />
            </button>
            {SideContent}
          </div>
        </div>
      )}

      {/* 车间移动端底部 Dock */}
      {dock && (
        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border/70 bg-background/90 backdrop-blur-xl no-print lg:hidden">
          <div className="mx-auto flex max-w-lg items-stretch justify-around px-2 pb-[env(safe-area-inset-bottom)]">
            {allItems.slice(0, 5).map((item) => {
              const active = isActive(item);
              const Icon = (item.icon && ICONS[item.icon]) || LayoutDashboard;
              return (
                <Link key={item.href} href={item.href}
                  className={cn("flex flex-1 flex-col items-center gap-0.5 rounded-lg py-2 text-[10px] font-medium spring-press",
                    active ? "text-cyan-300" : "text-muted-foreground")}>
                  <Icon className="h-5 w-5" />
                  {item.label}
                  {active && <span className="mt-0.5 h-0.5 w-6 rounded-full bg-cyan-400 shadow-[0_0_8px] shadow-cyan-400/80" />}
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </>
  );
}

function SideGroup({ label, items, isActive }: { label: string; items: NavItem[]; isActive: (i: NavItem) => boolean }) {
  return (
    <div className="flex-1">
      <div className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/70">{label}</div>
      <nav className="space-y-0.5">
        {items.map((item) => {
          const active = isActive(item);
          const Icon = (item.icon && ICONS[item.icon]) || LayoutDashboard;
          return (
            <Link key={item.href} href={item.href}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm spring-press",
                active
                  ? "bg-primary/10 font-semibold text-cyan-300 ring-1 ring-inset ring-primary/30"
                  : "text-foreground/75 hover:bg-secondary hover:text-foreground"
              )}>
              <Icon className={cn("h-4 w-4 shrink-0", active && "drop-shadow-[0_0_6px_rgba(34,211,238,0.6)]")} />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
