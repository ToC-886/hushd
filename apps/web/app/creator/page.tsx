"use client";

import * as React from "react";
import Link from "next/link";
import { RequireAuth } from "@/components/require-auth";
import { get, ApiError } from "@/lib/api";
import type { CreatorDashboard } from "@/lib/types";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form-error";
import { FullPageSpinner } from "@/components/ui/spinner";
import { formatCents } from "@/lib/format";

const ACTIONS = [
  { href: "/creator/tiers", title: "Subscription tiers", description: "Create and manage your tiers." },
  { href: "/creator/posts", title: "Posts", description: "Publish content to your subscribers." },
  { href: "/creator/payouts", title: "Payouts", description: "Accounts, balance, and payout requests." },
  { href: "/creator/profile", title: "Profile", description: "Display name, bio, and payout country." },
  { href: "/settings/verification", title: "Verification", description: "Identity verification status." },
] as const;

function Dashboard() {
  const [data, setData] = React.useState<CreatorDashboard | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await get<CreatorDashboard>("/creator/dashboard");
        if (!cancelled) setData(result);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 403) {
          setError("Complete identity verification to access your creator dashboard.");
        } else {
          setError("Could not load your dashboard. Try again.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="flex flex-col items-center gap-4 py-16">
        <FormError message={error} />
        <Link href="/settings/verification">
          <Button variant="secondary" size="sm">
            Go to verification
          </Button>
        </Link>
      </div>
    );
  }

  if (!data) return <FullPageSpinner label="Loading dashboard…" />;

  const kpis = [
    { label: "Active subscribers", value: String(data.activeSubscribers) },
    { label: "Active tiers", value: String(data.activeTiers) },
    { label: `Gross (${data.windowDays}d)`, value: formatCents(data.grossCents30d) },
    { label: `Net (${data.windowDays}d)`, value: formatCents(data.netCents30d) },
  ];

  return (
    <div className="flex flex-col gap-6">
      <section aria-label="Key metrics" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardHeader className="p-4">
              <CardDescription>{kpi.label}</CardDescription>
              <CardTitle className="text-2xl">{kpi.value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </section>

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {ACTIONS.map((action) => (
          <li key={action.href}>
            <Link href={action.href}>
              <Card className="h-full transition-colors hover:border-zinc-600">
                <CardHeader>
                  <CardTitle className="text-base">{action.title}</CardTitle>
                  <CardDescription>{action.description}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function CreatorDashboardPage() {
  return (
    <RequireAuth role="CREATOR">
      <main className="mx-auto w-full max-w-4xl px-4 py-8">
        <h1 className="mb-6 text-2xl font-semibold">Creator dashboard</h1>
        <Dashboard />
      </main>
    </RequireAuth>
  );
}
