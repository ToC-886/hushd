"use client";

import * as React from "react";
import { RequireAuth } from "@/components/require-auth";
import { get, post, patch, ApiError } from "@/lib/api";
import type { SubscriptionTier } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormError } from "@/components/ui/form-error";
import { FullPageSpinner, Spinner } from "@/components/ui/spinner";
import { formatCents } from "@/lib/format";

function TierRow({
  tier,
  onToggle,
  isSaving,
}: {
  tier: SubscriptionTier;
  onToggle: (tier: SubscriptionTier) => void;
  isSaving: boolean;
}) {
  return (
    <li className="flex items-center justify-between gap-3 border-b border-zinc-900 py-3 last:border-0">
      <div>
        <p className="text-sm font-medium text-zinc-100">{tier.title}</p>
        <p className="text-xs text-zinc-400">
          {formatCents(tier.priceCents)} / {tier.interval === "YEAR" ? "year" : "month"}
          {tier.trialDays > 0 ? ` · ${tier.trialDays}d trial` : ""}
        </p>
      </div>
      <Button
        variant={tier.active ? "secondary" : "ghost"}
        size="sm"
        onClick={() => onToggle(tier)}
        disabled={isSaving}
      >
        {isSaving ? <Spinner /> : tier.active ? "Deactivate" : "Activate"}
      </Button>
    </li>
  );
}

function Tiers() {
  const [tiers, setTiers] = React.useState<SubscriptionTier[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [togglingId, setTogglingId] = React.useState<string | null>(null);

  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [price, setPrice] = React.useState("");
  const [interval, setInterval_] = React.useState<"MONTH" | "YEAR">("MONTH");
  const [trialDays, setTrialDays] = React.useState("0");
  const [formError, setFormError] = React.useState<string | null>(null);
  const [isCreating, setIsCreating] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const data = await get<SubscriptionTier[]>("/creator/tiers");
      setTiers(data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setError("Complete identity verification to manage tiers.");
      } else {
        setError("Could not load tiers. Try again.");
      }
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const priceCents = Math.round(Number(price) * 100);
    if (!title.trim()) {
      setFormError("Give the tier a title.");
      return;
    }
    if (!Number.isFinite(priceCents) || priceCents < 100) {
      setFormError("Price must be at least 1.00.");
      return;
    }

    setIsCreating(true);
    try {
      await post("/creator/tiers", {
        title: title.trim(),
        description: description.trim() || undefined,
        priceCents,
        interval,
        trialDays: Number(trialDays) || 0,
      });
      setTitle("");
      setDescription("");
      setPrice("");
      setTrialDays("0");
      await load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Could not create the tier. Try again.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleToggle = async (tier: SubscriptionTier) => {
    setTogglingId(tier.id);
    try {
      await patch(`/creator/tiers/${encodeURIComponent(tier.id)}`, { active: !tier.active });
      await load();
    } catch {
      setError("Could not update the tier. Try again.");
    } finally {
      setTogglingId(null);
    }
  };

  if (error) {
    return (
      <div className="py-10">
        <FormError message={error} />
      </div>
    );
  }

  if (!tiers) return <FullPageSpinner label="Loading tiers…" />;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">New tier</CardTitle>
          <CardDescription>Subscribers join at a tier to unlock content.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="flex flex-col gap-4" noValidate>
            <div className="flex flex-col gap-2">
              <Label htmlFor="title">Title</Label>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="price">Price</Label>
                <Input
                  id="price"
                  inputMode="decimal"
                  placeholder="9.99"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="interval">Billing</Label>
                <select
                  id="interval"
                  value={interval}
                  onChange={(e) => setInterval_(e.target.value as "MONTH" | "YEAR")}
                  className="flex h-10 w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
                >
                  <option value="MONTH">Monthly</option>
                  <option value="YEAR">Yearly</option>
                </select>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="trial">Trial days (0–30)</Label>
              <Input
                id="trial"
                inputMode="numeric"
                value={trialDays}
                onChange={(e) => setTrialDays(e.target.value.replace(/\D/g, ""))}
                className="w-28"
              />
            </div>
            <FormError message={formError} />
            <Button type="submit" disabled={isCreating} className="self-start">
              {isCreating ? <Spinner /> : "Create tier"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your tiers</CardTitle>
          <CardDescription>{tiers.length} total</CardDescription>
        </CardHeader>
        <CardContent>
          {tiers.length === 0 ? (
            <p className="py-4 text-center text-sm text-zinc-400">
              No tiers yet. Create one above to start accepting subscribers.
            </p>
          ) : (
            <ul>
              {tiers.map((tier) => (
                <TierRow
                  key={tier.id}
                  tier={tier}
                  onToggle={handleToggle}
                  isSaving={togglingId === tier.id}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function TiersPage() {
  return (
    <RequireAuth role="CREATOR">
      <main className="mx-auto w-full max-w-2xl px-4 py-8">
        <h1 className="mb-6 text-2xl font-semibold">Subscription tiers</h1>
        <Tiers />
      </main>
    </RequireAuth>
  );
}
