"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type NavLink = { href: string; label: string; creatorOnly?: boolean };

const LINKS: NavLink[] = [
  { href: "/feed", label: "Feed" },
  { href: "/messages", label: "Messages" },
  { href: "/billing", label: "Billing" },
  { href: "/creator", label: "Creator", creatorOnly: true },
  { href: "/settings", label: "Settings" },
];

export function SiteNav() {
  const { me, isAuthenticated, logout, hasRole } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur">
      <nav className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4" aria-label="Main">
        <Link href="/" className="text-sm font-semibold uppercase tracking-widest text-zinc-100">
          hushd
        </Link>

        {isAuthenticated && (
          <ul className="hidden items-center gap-1 md:flex">
            {LINKS.filter((l) => !l.creatorOnly || hasRole("CREATOR")).map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  aria-current={pathname.startsWith(link.href) ? "page" : undefined}
                  className={cn(
                    "rounded-md px-3 py-2 text-sm transition-colors",
                    pathname.startsWith(link.href)
                      ? "bg-zinc-800 text-zinc-100"
                      : "text-zinc-400 hover:text-zinc-100",
                  )}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        )}

        <div className="ml-auto flex items-center gap-3">
          {isAuthenticated ? (
            <>
              <span className="hidden text-sm text-zinc-400 sm:inline">{me?.email}</span>
              <Button variant="ghost" size="sm" onClick={handleLogout}>
                Sign out
              </Button>
            </>
          ) : (
            <>
              <Link href="/login" className="text-sm text-zinc-300 hover:text-zinc-100">
                Sign in
              </Link>
              <Button size="sm" onClick={() => router.push("/register")}>
                Join
              </Button>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
