"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { FullPageSpinner } from "@/components/ui/spinner";
import type { UserRole } from "@/lib/types";

/**
 * Client-side route guard. Redirects unauthenticated users to /login and
 * enforces an optional role. Backend authorization is always the real
 * enforcement — this only governs what the UI renders.
 */
export function RequireAuth({
  children,
  role,
}: {
  children: React.ReactNode;
  role?: UserRole;
}) {
  const { me, isLoading, isAuthenticated, hasRole } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const needsRole = role !== undefined;
  const lacksRole = needsRole && !hasRole(role);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    if (lacksRole) {
      router.replace("/");
    }
  }, [isLoading, isAuthenticated, lacksRole, router, pathname]);

  if (isLoading) {
    return <FullPageSpinner />;
  }
  if (!isAuthenticated || lacksRole || !me) {
    return <FullPageSpinner label="Redirecting…" />;
  }
  return <>{children}</>;
}
