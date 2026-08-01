"use client";

import * as React from "react";
import { post, ApiError } from "../../lib/api";
import { RequireAuth } from "../../lib/require-auth";
import { useApiQuery } from "../../lib/use-api";
import type { FraudDashboard, LedgerHold } from "../../lib/types";
import { formatCents, formatDateTime } from "../../lib/format";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Spinner } from "../../components/ui/spinner";
import { FormError } from "../../components/ui/form-error";

function Risk() {
  const fraud = useApiQuery<FraudDashboard>("/admin/fraud/dashboard");
  const holds = useApiQuery<LedgerHold[]>("/admin/risk/holds");
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);

  const handleRelease = async (hold: LedgerHold) => {
    setActionError(null);
    setBusyId(hold.id);
    try {
      await post(`/admin/risk/holds/${hold.id}/release`);
      holds.refetch();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Failed to release hold.");
    } finally {
      setBusyId(null);
    }
  };

  const isLoading = fraud.isLoading || holds.isLoading;
  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner label="Loading risk data" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Risk &amp; fraud</h1>
        <p className="mt-1 text-sm text-slate-500">
          Chargeback/refund signals and active ledger holds placed on creator balances.
        </p>
      </div>
      <FormError message={fraud.error ?? holds.error ?? actionError} />

      <section className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Chargebacks</CardDescription>
            <CardTitle className="text-3xl">{fraud.data?.chargebacks ?? "—"}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Refunds</CardDescription>
            <CardTitle className="text-3xl">{fraud.data?.refunds ?? "—"}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Failed payouts</CardDescription>
            <CardTitle className="text-3xl">{fraud.data?.failedPayouts ?? "—"}</CardTitle>
          </CardHeader>
        </Card>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Active ledger holds</h2>
        {!holds.data || holds.data.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-slate-500">
              There are no active holds.
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
                      <th className="px-4 py-3 font-medium">Reason</th>
                      <th className="px-4 py-3 font-medium">Placed</th>
                      <th className="px-4 py-3 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {holds.data.map((h) => (
                      <tr key={h.id} className="border-b border-slate-100 last:border-0">
                        <td className="px-4 py-3">
                          <div className="font-medium">{h.creator.displayName ?? h.creator.slug}</div>
                          <div className="text-xs text-slate-500">@{h.creator.slug}</div>
                        </td>
                        <td className="px-4 py-3 font-medium">{formatCents(h.amountCents, h.currency)}</td>
                        <td className="px-4 py-3 text-slate-600">{h.reason}</td>
                        <td className="px-4 py-3 text-slate-600">{formatDateTime(h.createdAt)}</td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleRelease(h)}
                              disabled={busyId === h.id}
                            >
                              {busyId === h.id ? "Releasing…" : "Release"}
                            </Button>
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
      </section>
    </div>
  );
}

export default function RiskPage() {
  return (
    <RequireAuth>
      <Risk />
    </RequireAuth>
  );
}
