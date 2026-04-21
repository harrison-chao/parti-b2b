"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function Nav({
  items,
  user,
}: {
  items: { href: string; label: string }[];
  user: { name: string; role: string };
}) {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-10 border-b border-white/60 bg-white/75 shadow-sm shadow-slate-900/5 backdrop-blur-xl no-print print:hidden">
      <div className="container flex min-h-16 flex-col gap-3 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:gap-6">
          <Link href="/" className="group flex items-center gap-3 font-bold text-lg tracking-tight">
            <span className="grid h-9 w-9 place-items-center rounded-2xl bg-gradient-to-br from-teal-700 to-amber-500 text-sm font-black text-white shadow-lg shadow-teal-900/20 transition-transform group-hover:-rotate-3 group-hover:scale-105">
              P
            </span>
            <span>
              Parti B2B
              <span className="block text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">Operations ERP</span>
            </span>
          </Link>
          <nav className="flex max-w-full items-center gap-1 overflow-x-auto rounded-full bg-slate-900/5 p-1">
            {items.map((item) => {
              const active = pathname === item.href || (item.href !== "/dealer" && item.href !== "/admin" && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold transition-all",
                    active
                      ? "bg-slate-950 text-white shadow-md shadow-slate-900/20"
                      : "text-slate-600 hover:bg-white/80 hover:text-slate-950"
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center justify-between gap-3 lg:justify-end">
          <span className="rounded-full border border-white/70 bg-white/70 px-3 py-1.5 text-sm text-muted-foreground shadow-sm">
            <span className="font-semibold text-foreground">{user.name}</span> <span className="text-xs">· {user.role}</span>
          </span>
          <Button size="sm" variant="outline" onClick={() => signOut({ callbackUrl: "/login" })}>
            退出
          </Button>
        </div>
      </div>
    </header>
  );
}
