"use client";

import * as React from "react";
import { RequireAuth } from "@/components/require-auth";
import { get, post, ApiError } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormError } from "@/components/ui/form-error";
import { FullPageSpinner, Spinner } from "@/components/ui/spinner";
import { formatCents, formatDateTime } from "@/lib/format";

type PayoutAccount = {
  id: string;
  method: string;
  label: string | null;
  last4: string | null;
  currency: string;
  createdAt: string;
};

type PayoutRow = {
  id: string;
  amountCents: number;
  currency: string;
  status: string;
  requestedAt: string;
  payoutAccount: { method: string; last4: string | null; label: string | null };
};

type Balance = { availableCents: number };

function Payouts() {
  const [balance, setBalance] = React.useState<Balance | null>(null);
  const [accounts, setAccounts] = React.useState<PayoutAccount[] | null>(null);
  const [payouts, setPayouts] = React.useState<PayoutRow[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const [method, setMethod] = React.useState("SEPA");
  const [label, setLabel] = React.useState("");
  const [reference, setReference] = React.useState("");
  const [accountError, setAccountError] = React.useState<string | null>(null);
  const [isAdding, setIsAdding] = React.useState(false);

  const [requestError, setRequestError] = React.useState<string | null>(null);
  const [requestNotice, setRequestNotice] = React.useState<string | null>(null);
  const [isRequesting, setIsRequesting] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const [b, a, p] = await Promise.all([
        get<Balance>("/payouts/balance"),
        get<PayoutAccount[]>("/payouts/accounts"),
        get<PayoutRow[]>("/payouts/me"),
      ]);
      setBalance(b);
      setAccounts(a);
      setPayouts(p);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setError("Complete identity verification to manage payouts.");
      } else {
        setError("Could not load payouts. Try again.");
      }
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setAccountError(null);
    if (reference.trim().length < 4) {
      setAccountError("Enter a valid account reference (e.g. IBAN).");
      return;
    }
    setIsAdding(true);
    try {
      await post("/payouts/accounts", {
        method,
        label: label.trim() || undefined,
        accountReference: reference.trim(),
      });
      setLabel("");
      setReference("");
      await load();
    } catch (err) {
      setAccountError(err instanceof ApiError ? err.message : "Could not add the account. Try again.");
    } finally {
      setIsAdding(false);
    }
  };

  const handleRequest = async () => {
    setRequestError(null);
    setRequestNotice(null);
    setIsRequesting(true);
    try {
      await post("/payouts/request", {});
      setRequestNotice("Payout requested. It will be reviewed shortly.");
      await load();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.message.includes("kyc_required")) {
          setRequestError("Complete identity verification before requesting a payout.");
        } else if (err.message.includes("below_minimum_payout")) {
          setRequestError("Your balance is below the minimum payout amount.");
        } else if (err.message.includes("payout_on_hold")) {
          setRequestError("Payouts are currently on hold for your account. Contact support.");
        } else if (err.message.includes("payout_blocked_country")) {
          setRequestError("Payouts are not available in your payout country.");
        } else if (err.message.includes("payout_account_required")) {
          setRequestError("Add a payout account first.");
        } else {
          setRequestError(err.message);
        }
      } else {
        setRequestError("Could not request a payout. Try again.");
      }
    } finally {
      setIsRequesting(false);
    }
  };

  if (error) {
    return (
      <div className="py-10">
        <FormError message={error} />
      </div>
    );
  }

  if (!balance || !accounts || !payouts) return <FullPageSpinner label="Loading payouts…" />;

  const currency = accounts[0]?.currency ?? "EUR";

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardDescription>Available balance</CardDescription>
          <CardTitle className="text-3xl">{formatCents(balance.availableCents, currency)}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button
            onClick={handleRequest}
            disabled={isRequesting || balance.availableCents <= 0}
            className="self-start"
          >
            {isRequesting ? <Spinner /> : "Request payout"}
          </Button>
          <FormError message={requestError} />
          {requestNotice && <p className="text-sm text-emerald-400">{requestNotice}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payout accounts</CardTitle>
          <CardDescription>Only the last 4 characters are stored visibly.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {accounts.length === 0 ? (
            <p className="text-sm text-zinc-400">No accounts yet. Add one below.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {accounts.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between rounded-md border border-zinc-800 px-3 py-2 text-sm"
                >
                  <span className="text-zinc-100">{a.label ?? a.method}</span>
                  <span className="text-zinc-400">
                    {a.method} ···{a.last4} · {a.currency}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={handleAddAccount} className="flex flex-col gap-3 border-t border-zinc-800 pt-4" noValidate>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="method">Method</Label>
                <select
                  id="method"
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
                >
                  <option value="SEPA">SEPA</option>
                  <option value="ACH">ACH</option>
                  <option value="WIRE">Wire</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="label">Label (optional)</Label>
                <Input id="label" value={label} onChange={(e) => setLabel(e.target.value)} />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="reference">Account reference (IBAN / account number)</Label>
              <Input
                id="reference"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                required
              />
            </div>
            <FormError message={accountError} />
            <Button type="submit" variant="secondary" disabled={isAdding} className="self-start">
              {isAdding ? <Spinner /> : "Add account"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payout history</CardTitle>
          <CardDescription>{payouts.length} payouts</CardDescription>
        </CardHeader>
        <CardContent>
          {payouts.length === 0 ? (
            <p className="py-2 text-sm text-zinc-400">No payouts yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {payouts.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between rounded-md border border-zinc-800 px-3 py-2 text-sm"
                >
                  <div>
                    <p className="text-zinc-100">{formatCents(p.amountCents, p.currency)}</p>
                    <p className="text-xs text-zinc-500">{formatDateTime(p.requestedAt)}</p>
                  </div>
                  <span
                    className={
                      p.status === "PAID"
                        ? "text-emerald-400"
                        : p.status === "REJECTED" || p.status === "FAILED"
                          ? "text-red-400"
                          : "text-amber-400"
                    }
                  >
                    {p.status.toLowerCase()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function PayoutsPage() {
  return (
    <RequireAuth role="CREATOR">
      <main className="mx-auto w-full max-w-2xl px-4 py-8">
        <h1 className="mb-6 text-2xl font-semibold">Payouts</h1>
        <Payouts />
      </main>
    </RequireAuth>
  );
}
