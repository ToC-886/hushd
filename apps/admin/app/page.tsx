"use client";

import Link from "next/link";
import { RequireAuth } from "../lib/require-auth";
import { useApiQuery } from "../lib/use-api";
import type { FraudDashboard, ModerationQueueItem, Payout, LedgerHold } from "../lib/types";
import { Card, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Spinner } from "../components/ui/spinner";
import { FormError } from "../components/ui/form-error";

function StatCard({ label, value, href }: { label: string; value: number | string; href: string }) {
  return (
    <Link href={href}>
      <Card className="transition-colors hover:border-slate-400">
        <CardHeader className="pb-2">
          <CardDescription>{label}</CardDescription>
          <CardTitle className="text-3xl">{value}</CardTitle>
        </CardHeader>
      </Card>
    </Link>
  );
}

function Overview() {
  const fraud = useApiQuery<FraudDashboard>("/admin/fraud/dashboard");
  const moderation = useApiQuery<ModerationQueueItem[]>("/admin/moderation/queue");
  const payouts = useApiQuery<Payout[]>("/admin/payouts");
  const holds = useApiQuery<LedgerHold[]>("/admin/risk/holds");

  const isLoading = fraud.isLoading || moderation.isLoading || payouts.isLoading || holds.isLoading;
  const error = fraud.error ?? moderation.error ?? payouts.error ?? holds.error;

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner label="Loading overview" />
      </div>
    );
  }

  const pendingModeration = moderation.data?.length ?? 0;
  const openPayouts = payouts.data?.length ?? 0;
  const activeHolds = holds.data?.length ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Operations overview</h1>
        <p className="mt-1 text-sm text-slate-500">
          Live counts across moderation, payouts, risk holds, and fraud signals.
        </p>
      </div>
      <FormError message={error} />
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Moderation queue" value={pendingModeration} href="/moderation" />
        <StatCard label="Open payouts" value={openPayouts} href="/payouts" />
        <StatCard label="Active risk holds" value={activeHolds} href="/risk" />
        <StatCard label="Chargebacks" value={fraud.data?.chargebacks ?? "—"} href="/risk" />
        <StatCard label="Refunds" value={fraud.data?.refunds ?? "—"} href="/risk" />
        <StatCard label="Failed payouts" value={fraud.data?.failedPayouts ?? "—"} href="/payouts" />
      </section>
    </div>
  );
}

export default function AdminHome() {
  return (
    <RequireAuth>
      <Overview />
    </RequireAuth>
  );
}
