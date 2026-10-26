"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Building2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAVIGATION, canAccess } from "@/config/navigation";
import type { SessionUserClaims } from "@/lib/authz";
import { Button } from "@/components/ui/button";

export function Sidebar({ user }: { user: SessionUserClaims }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const nav = (
    <nav className="flex-1 space-y-6 overflow-y-auto p-4">
      {NAVIGATION.map((section) => {
        const items = section.items.filter((i) => canAccess(user.permissions, i.permission));
        if (!items.length) return null;
        return (
          <div key={section.label}>
            <p className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {section.label}
            </p>
            <div className="space-y-0.5">
              {items.map((item) => {
                const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
                      active
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {item.title}
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );

  return (
    <>
      {open ? (
        <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setOpen(false)}>
          <Button variant="ghost" size="icon" className="absolute right-3 top-3 text-white" onClick={() => setOpen(false)}>
            <X className="h-5 w-5" />
          </Button>
        </div>
      ) : null}

      {/* Desktop */}
      <aside className="hidden w-64 shrink-0 flex-col border-r bg-card lg:flex">
        <Brand />
        {nav}
      </aside>

      {/* Mobile drawer */}
      {open ? (
        <aside className="fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r bg-card lg:hidden">
          <Brand />
          {nav}
        </aside>
      ) : null}

      {/* Toggle for small screens */}
      <button
        className="fixed bottom-4 left-4 z-20 rounded-full bg-primary p-3 text-primary-foreground shadow-lg lg:hidden"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
      >
        <Building2 className="h-5 w-5" />
      </button>
    </>
  );
}

function Brand() {
  return (
    <div className="flex h-14 items-center gap-2 border-b px-5">
      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <Building2 className="h-4 w-4" />
      </div>
      <div className="leading-tight">
        <p className="text-sm font-bold tracking-tight">PayrollHRM</p>
        <p className="text-[11px] text-muted-foreground">Payroll & HRMS</p>
      </div>
    </div>
  );
}