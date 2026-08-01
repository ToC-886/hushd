"use client"

import * as React from "react"
import { RequireAuth } from "@/components/require-auth"
import { get, post, ApiError } from "@/lib/api"
import type { Transaction } from "@/lib/types"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { FormError } from "@/components/ui/form-error"
import { FullPageSpinner, Spinner } from "@/components/ui/spinner"
import { formatCents, formatDateTime } from "@/lib/format"

type SubscriptionRow = {
  id: string
  status: string
  cancelAtPeriodEnd: boolean
  currentPeriodEnd: string | null
  creator: { slug: string; displayName: string | null }
  tier: { id: string; title: string; priceCents: number; interval: string }
}

function typeLabel(type: string): string {
  return type
    .split("_")
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ")
}

function BillingPage() {
  const [rows, setRows] = React.useState<Transaction[] | null>(null)
  const [subs, setSubs] = React.useState<SubscriptionRow[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [cancelError, setCancelError] = React.useState<string | null>(null)
  const [cancellingId, setCancellingId] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    const [history, subscriptions] = await Promise.all([
      get<Transaction[]>("/billing/history"),
      get<SubscriptionRow[]>("/billing/subscriptions"),
    ])
    setRows(history)
    setSubs(subscriptions)
  }, [])

  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        await load()
      } catch (err) {
        if (cancelled) return
        if (err instanceof ApiError && err.status === 403) {
          setError("Complete age verification to view billing.")
        } else {
          setError("Could not load billing. Try again.")
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [load])

  const handleCancel = async (subscriptionId: string) => {
    setCancelError(null)
    setCancellingId(subscriptionId)
    try {
      await post("/billing/subscriptions/cancel", { subscriptionId, reason: "user_requested" })
      await load()
    } catch (err) {
      setCancelError(err instanceof ApiError ? err.message : "Could not cancel subscription.")
    } finally {
      setCancellingId(null)
    }
  }

  if (error) {
    return (
      <div className="py-10">
        <FormError message={error} />
      </div>
    )
  }

  if (!rows || !subs) return <FullPageSpinner label="Loading billing…" />

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Subscriptions</CardTitle>
          <CardDescription>Active and recent creator subscriptions.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {subs.length === 0 ? (
            <p className="text-sm text-zinc-400">No subscriptions yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {subs.map((sub) => {
                const canCancel = sub.status === "ACTIVE" || sub.status === "PAST_DUE" || sub.status === "INCOMPLETE"
                return (
                  <li
                    key={sub.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-zinc-800 px-3 py-2 text-sm"
                  >
                    <div className="flex flex-col">
                      <span className="font-medium text-zinc-100">
                        {sub.creator.displayName ?? sub.creator.slug}
                      </span>
                      <span className="text-xs text-zinc-400">
                        {sub.tier.title} · {formatCents(sub.tier.priceCents)} /{" "}
                        {sub.tier.interval.toLowerCase()} · {sub.status}
                        {sub.cancelAtPeriodEnd ? " · cancels at period end" : ""}
                      </span>
                    </div>
                    {canCancel && !sub.cancelAtPeriodEnd && (
                      <Button
                        variant="secondary"
                        disabled={cancellingId === sub.id}
                        onClick={() => void handleCancel(sub.id)}
                      >
                        {cancellingId === sub.id ? <Spinner /> : "Cancel"}
                      </Button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
          <FormError message={cancelError} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payment history</CardTitle>
          <CardDescription>Your last {rows.length} transactions.</CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-zinc-400">
              No payments yet. Subscriptions, PPV unlocks, and tips will appear here.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-xs uppercase tracking-wide text-zinc-500">
                    <th className="py-2 pr-4 font-medium">Date</th>
                    <th className="py-2 pr-4 font-medium">Type</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 pr-4 font-medium">Gross</th>
                    <th className="py-2 font-medium">Processor</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b border-zinc-900">
                      <td className="py-2 pr-4 text-zinc-300">{formatDateTime(row.occurredAt)}</td>
                      <td className="py-2 pr-4 text-zinc-200">{typeLabel(row.type)}</td>
                      <td className="py-2 pr-4 text-zinc-400">{row.status}</td>
                      <td className="py-2 pr-4 text-zinc-200">
                        {formatCents(row.grossCents, row.currency)}
                      </td>
                      <td className="py-2 text-zinc-400">{row.processor}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default function BillingRoute() {
  return (
    <RequireAuth>
      <main className="mx-auto w-full max-w-3xl px-4 py-8">
        <h1 className="mb-6 text-2xl font-semibold tracking-tight">Billing</h1>
        <BillingPage />
      </main>
    </RequireAuth>
  )
}
