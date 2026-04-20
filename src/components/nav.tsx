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
    <header className="border-b bg-white sticky top-0 z-10">
      <div className="container flex h-14 items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/" className="font-bold text-lg">Parti B2B</Link>
          <nav className="flex items-center gap-1">
            {items.map((item) => {
              const active = pathname === item.href || (item.href !== "/dealer" && item.href !== "/admin" && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                    active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {user.name} <span className="text-xs">· {user.role}</span>
          </span>
          <Button size="sm" variant="outline" onClick={() => signOut({ callbackUrl: "/login" })}>
            退出
          </Button>
        </div>
      </div>
    </header>
  );
}
