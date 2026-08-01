"use client";

import * as React from "react";
import { post, ApiError } from "../../lib/api";
import { RequireAuth } from "../../lib/require-auth";
import { useApiQuery } from "../../lib/use-api";
import type { Payout } from "../../lib/types";
import { formatCents, formatDateTime } from "../../lib/format";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { Spinner } from "../../components/ui/spinner";
import { FormError } from "../../components/ui/form-error";
import { cn } from "../../lib/utils";

type StatusFilter = "OPEN" | "REQUESTED" | "APPROVED" | "PAID" | "CANCELED" | "FAILED";

const FILTERS: { id: StatusFilter; label: string }[] = [
  { id: "OPEN", label: "Open" },
  { id: "REQUESTED", label: "Requested" },
  { id: "APPROVED", label: "Approved" },
  { id: "PAID", label: "Paid" },
  { id: "CANCELED", label: "Canceled" },
  { id: "FAILED", label: "Failed" },
];

function statusVariant(status: string): "warning" | "secondary" | "success" | "destructive" | "default" {
  if (status === "REQUESTED") return "warning";
  if (status === "APPROVED") return "default";
  if (status === "PAID") return "success";
  if (status === "FAILED" || status === "CANCELED") return "destructive";
  return "secondary";
}

function Payouts() {
  const [filter, setFilter] = React.useState<StatusFilter>("OPEN");
  const path = filter === "OPEN" ? "/admin/payouts" : `/admin/payouts?status=${filter}`;
  const { data, isLoading, error, refetch } = useApiQuery<Payout[]>(path);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>, id: string) => {
    setActionError(null);
    setBusyId(id);
    try {
      await fn();
      refetch();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Action failed.");
    } finally {
      setBusyId(null);
    }
  };

  const handleApprove = (p: Payout) => run(() => post(`/admin/payouts/${p.id}/approve`), p.id);
  const handlePaid = (p: Payout) => {
    const processorRef = window.prompt("Processor reference (optional):") ?? undefined;
    run(() => post(`/admin/payouts/${p.id}/paid`, { processorRef }), p.id);
  };
  const handleCancel = (p: Payout) => {
    const reason = window.prompt("Cancellation reason (optional):") ?? undefined;
    run(() => post(`/admin/payouts/${p.id}/cancel`, { reason }), p.id);
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Payouts</h1>
        <p className="mt-1 text-sm text-slate-500">
          Approve, settle, or cancel creator payouts. Approval re-checks jurisdiction before release.
        </p>
      </div>

      <div className="flex flex-wrap gap-1">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm transition-colors",
              filter === f.id ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <FormError message={error ?? actionError} />

      {isLoading ? (
        <div className="flex h-48 items-center justify-center">
          <Spinner label="Loading payouts" />
        </div>
      ) : !data || data.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-slate-500">
            No payouts match this filter.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3 font-medium">Creator</th>
                    <th className="px-4 py-3 font-medium">Amount</th>
                    <th className="px-4 py-3 font-medium">Method</th>
                    <th className="px-4 py-3 font-medium">Requested</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((p) => (
                    <tr key={p.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-3">
                        <div className="font-medium">{p.creator.displayName ?? p.creator.slug}</div>
                        <div className="text-xs text-slate-500">@{p.creator.slug}</div>
                      </td>
                      <td className="px-4 py-3 font-medium">{formatCents(p.amountCents, p.currency)}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {p.payoutAccount ? (
                          <>
                            {p.payoutAccount.method}
                            {p.payoutAccount.last4 ? ` ••${p.payoutAccount.last4}` : ""}
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{formatDateTime(p.requestedAt)}</td>
                      <td className="px-4 py-3">
                        <Badge variant={statusVariant(p.status)}>{p.status}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          {p.status === "REQUESTED" ? (
                            <Button size="sm" onClick={() => handleApprove(p)} disabled={busyId === p.id}>
                              Approve
                            </Button>
                          ) : null}
                          {p.status === "APPROVED" ? (
                            <Button size="sm" onClick={() => handlePaid(p)} disabled={busyId === p.id}>
                              Mark paid
                            </Button>
                          ) : null}
                          {p.status === "REQUESTED" || p.status === "APPROVED" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleCancel(p)}
                              disabled={busyId === p.id}
                            >
                              Cancel
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function PayoutsPage() {
  return (
    <RequireAuth>
      <Payouts />
    </RequireAuth>
  );
}
