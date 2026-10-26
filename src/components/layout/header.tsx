"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { LogOut, ShieldCheck, ChevronDown, UserRound } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import type { SessionUserClaims } from "@/lib/authz";

export function Header({ user }: { user: SessionUserClaims }) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleLogout = async () => {
    await signOut({ redirect: false });
    router.push("/login");
    router.refresh();
  };

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b bg-card px-4 lg:px-6">
      <p className="text-sm text-muted-foreground">
        {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
      </p>

      <div className="relative" ref={menuRef}>
        <button
          className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent"
          onClick={() => setMenuOpen((v) => !v)}
        >
          <Avatar name={user.name} size="sm" />
          <span className="hidden text-left sm:block">
            <span className="block text-sm font-medium leading-tight">{user.name}</span>
            <span className="block text-[11px] leading-tight text-muted-foreground">{user.email}</span>
          </span>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </button>

        {menuOpen ? (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 top-full z-50 mt-1 w-60 rounded-md border bg-popover p-1 shadow-md">
              <div className="border-b px-2 py-1.5 pb-2">
                <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <UserRound className="h-3.5 w-3.5" /> {user.roleCodes.join(", ")}
                </p>
                {user.companyId ? (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">Tenant scoped account</p>
                ) : (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">Platform account</p>
                )}
              </div>
              <button
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                onClick={() => {
                  setMenuOpen(false);
                  router.push("/admin/security");
                }}
              >
                <ShieldCheck className="h-4 w-4" /> Security & sessions
              </button>
              <button
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-destructive hover:bg-destructive/10"
                onClick={handleLogout}
              >
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            </div>
          </>
        ) : null}
      </div>
    </header>
  );
}