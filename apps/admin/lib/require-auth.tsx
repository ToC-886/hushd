"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "./auth-context"
import { Spinner } from "../components/ui/spinner"

/**
 * Protects admin pages. Re-checks the ADMIN role against the API on every
 * load — the session cookie alone does not prove admin membership.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { isAuthenticated, isAdmin, isLoading, logout } = useAuth()

  React.useEffect(() => {
    if (isLoading) return
    if (!isAuthenticated) {
      router.replace("/login")
      return
    }
    if (!isAdmin) {
      void logout().finally(() => router.replace("/login"))
    }
  }, [isLoading, isAuthenticated, isAdmin, logout, router])

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner label="Loading" />
      </div>
    )
  }
  if (!isAuthenticated || !isAdmin) {
    return null
  }
  return <>{children}</>
}
