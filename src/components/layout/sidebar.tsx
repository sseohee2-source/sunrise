"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { NAV } from "./nav";

function isActive(pathname: string, href: string, exact = false) {
  if (href === "/" || exact) return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="bg-sidebar text-sidebar-foreground sticky top-0 flex h-screen w-56 shrink-0 flex-col print:hidden">
      <Link href="/" className="border-sidebar-border border-b px-5 py-4">
        <div className="text-xs opacity-70">이사회 사무국</div>
        <div className="text-base font-bold">이사회 실적관리</div>
      </Link>
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        <ul className="space-y-0.5">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.children ? item.children[0].href : item.href}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                    active ? "bg-sidebar-accent font-semibold" : "hover:bg-sidebar-accent/60",
                  )}
                >
                  <Icon className="size-4 opacity-80" />
                  {item.label}
                </Link>
                {item.children && active && (
                  <ul className="mt-0.5 mb-1 ml-9 space-y-0.5 border-l border-white/15 pl-2">
                    {item.children.map((c) => {
                      // 하위 메뉴 첫 항목(부모와 같은 경로)은 정확히 일치할 때만 강조
                      const childActive = isActive(pathname, c.href, c.href === item.href);
                      return (
                        <li key={c.href}>
                          <Link
                            href={c.href}
                            className={cn(
                              "block rounded px-2 py-1.5 text-[13px]",
                              childActive ? "bg-white/15 font-semibold" : "opacity-80 hover:opacity-100",
                            )}
                          >
                            {c.label}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
