"use client";

import * as React from "react";
import { RequireAuth } from "@/components/require-auth";
import { get, post, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { VerificationStatus } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form-error";
import { FullPageSpinner, Spinner } from "@/components/ui/spinner";
import { formatDate } from "@/lib/format";

type StartResult = { verificationId: string; redirectUrl: string };

function statusBadge(status: string | undefined): { label: string; className: string } {
  if (status === "APPROVED") return { label: "Approved", className: "text-emerald-400" };
  if (status === "PENDING") return { label: "Pending review", className: "text-amber-400" };
  if (status === "REJECTED") return { label: "Rejected", className: "text-red-400" };
  return { label: "Not started", className: "text-zinc-400" };
}

function VerificationPanel() {
  const { hasRole } = useAuth();
  const [status, setStatus] = React.useState<VerificationStatus | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [starting, setStarting] = React.useState<"age" | "id" | null>(null);

  const load = React.useCallback(async () => {
    try {
      const data = await get<VerificationStatus>("/verification/status");
      setStatus(data);
    } catch {
      setError("Could not load verification status. Try again.");
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const start = async (kind: "age" | "id") => {
    setError(null);
    setStarting(kind);
    try {
      const result = await post<StartResult>(`/verification/${kind}/start`, {
        returnUrl: window.location.href,
      });
      if (result.redirectUrl && result.redirectUrl !== window.location.href) {
        window.location.assign(result.redirectUrl);
        return;
      }
      await load();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not start verification. Try again.",
      );
    } finally {
      setStarting(null);
    }
  };

  if (!status && !error) return <FullPageSpinner label="Loading verification…" />;

  const age = status?.ageVerification ?? null;
  const idv = status?.idVerification ?? null;
  const ageBadge = statusBadge(age?.status);
  const idBadge = statusBadge(idv?.status);

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Age verification</CardTitle>
            <span className={`text-sm font-medium ${ageBadge.className}`}>{ageBadge.label}</span>
          </div>
          <CardDescription>
            Required to view adult content, subscribe, and message creators.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {age?.status === "APPROVED" && age.expiresAt && (
            <p className="text-sm text-zinc-400">Valid until {formatDate(age.expiresAt)}.</p>
          )}
          {age?.status !== "APPROVED" && (
            <Button onClick={() => start("age")} disabled={starting !== null} className="self-start">
              {starting === "age" ? <Spinner /> : age?.status === "PENDING" ? "Continue verification" : "Start age verification"}
            </Button>
          )}
        </CardContent>
      </Card>

      {hasRole("CREATOR") && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Identity verification</CardTitle>
              <span className={`text-sm font-medium ${idBadge.className}`}>{idBadge.label}</span>
            </div>
            <CardDescription>
              Required for creators to publish content and receive payouts.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {idv?.status === "APPROVED" && idv.expiresAt && (
              <p className="text-sm text-zinc-400">Valid until {formatDate(idv.expiresAt)}.</p>
            )}
            {idv?.status !== "APPROVED" && (
              <Button onClick={() => start("id")} disabled={starting !== null} className="self-start">
                {starting === "id" ? <Spinner /> : idv?.status === "PENDING" ? "Continue verification" : "Start ID verification"}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <FormError message={error} />
    </div>
  );
}

export default function VerificationPage() {
  return (
    <RequireAuth>
      <main className="mx-auto w-full max-w-2xl px-4 py-8">
        <h1 className="mb-6 text-2xl font-semibold">Verification</h1>
        <VerificationPanel />
      </main>
    </RequireAuth>
  );
}
