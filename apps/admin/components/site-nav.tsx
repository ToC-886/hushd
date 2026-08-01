"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "../lib/auth-context";
import { Button } from "./ui/button";
import { cn } from "../lib/utils";

const LINKS: { href: string; label: string }[] = [
  { href: "/", label: "Overview" },
  { href: "/moderation", label: "Moderation" },
  { href: "/payouts", label: "Payouts" },
  { href: "/risk", label: "Risk" },
  { href: "/geo-blocks", label: "Geo Blocks" },
  { href: "/dmca", label: "DMCA" },
  { href: "/audit-logs", label: "Audit Logs" },
  { href: "/compliance", label: "Compliance" },
];

export function SiteNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, me, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
  };

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-base font-semibold tracking-tight">
            hushd <span className="text-slate-400">admin</span>
          </Link>
          {isAuthenticated ? (
            <nav aria-label="Admin" className="hidden items-center gap-1 md:flex">
              {LINKS.map((link) => {
                const active = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-sm transition-colors",
                      active
                        ? "bg-slate-900 text-white"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                    )}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </nav>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          {isAuthenticated ? (
            <>
              <span className="hidden text-xs text-slate-500 sm:inline">
                {me?.email}
              </span>
              <Button variant="outline" size="sm" onClick={handleLogout}>
                Sign out
              </Button>
            </>
          ) : (
            <Link href="/login" className="text-sm text-slate-600 hover:text-slate-900">
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
