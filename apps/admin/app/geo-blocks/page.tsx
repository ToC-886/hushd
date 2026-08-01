"use client";

import * as React from "react";
import { post, del, ApiError } from "../../lib/api";
import { RequireAuth } from "../../lib/require-auth";
import { useApiQuery } from "../../lib/use-api";
import type { GeoBlock } from "../../lib/types";
import { formatDateTime } from "../../lib/format";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Spinner } from "../../components/ui/spinner";
import { FormError } from "../../components/ui/form-error";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { cn } from "../../lib/utils";

function GeoBlocks() {
  const { data, isLoading, error, refetch } = useApiQuery<GeoBlock[]>("/admin/geo-blocks");
  const [countryCode, setCountryCode] = React.useState("");
  const [scope, setScope] = React.useState<"ACCESS" | "PAYOUTS">("ACCESS");
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setActionError(null);
    setBusy(true);
    try {
      await post("/admin/geo-blocks", {
        countryCode: countryCode.trim().toUpperCase(),
        scope,
        reason: reason.trim() || undefined,
      });
      setCountryCode("");
      setReason("");
      refetch();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Failed to create geo block.");
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (block: GeoBlock) => {
    setActionError(null);
    try {
      await del(`/admin/geo-blocks/${block.countryCode}?scope=${block.scope}`);
      refetch();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Failed to remove geo block.");
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Geo blocks</h1>
        <p className="mt-1 text-sm text-slate-500">
          Restrict access or payouts by country. ACCESS blocks the site; PAYOUTS blocks money-out.
        </p>
      </div>
      <FormError message={error ?? actionError} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add geo block</CardTitle>
          <CardDescription>Use an ISO 3166-1 alpha-2 country code (e.g. US, DE, KP).</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-3">
            <div className="flex w-28 flex-col gap-1.5">
              <Label htmlFor="cc">Country</Label>
              <Input
                id="cc"
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
                placeholder="US"
                maxLength={2}
                required
                className="uppercase"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="scope">Scope</Label>
              <select
                id="scope"
                value={scope}
                onChange={(e) => setScope(e.target.value as "ACCESS" | "PAYOUTS")}
                className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
              >
                <option value="ACCESS">Access</option>
                <option value="PAYOUTS">Payouts</option>
              </select>
            </div>
            <div className="flex min-w-[16rem] flex-1 flex-col gap-1.5">
              <Label htmlFor="reason">Reason (optional)</Label>
              <Input
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Sanctions / legal requirement"
              />
            </div>
            <Button type="submit" disabled={busy}>
              {busy ? "Adding…" : "Add block"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex h-48 items-center justify-center">
          <Spinner label="Loading geo blocks" />
        </div>
      ) : !data || data.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-slate-500">
            No geo blocks configured.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3 font-medium">Country</th>
                    <th className="px-4 py-3 font-medium">Scope</th>
                    <th className="px-4 py-3 font-medium">Reason</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Updated</th>
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((b) => (
                    <tr key={b.id} className={cn("border-b border-slate-100 last:border-0", !b.active && "opacity-50")}>
                      <td className="px-4 py-3 font-mono font-medium">{b.countryCode}</td>
                      <td className="px-4 py-3">
                        <Badge variant={b.scope === "PAYOUTS" ? "warning" : "secondary"}>{b.scope}</Badge>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{b.reason ?? "—"}</td>
                      <td className="px-4 py-3">
                        <Badge variant={b.active ? "destructive" : "secondary"}>{b.active ? "Active" : "Inactive"}</Badge>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{formatDateTime(b.updatedAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end">
                          {b.active ? (
                            <Button size="sm" variant="outline" onClick={() => handleRemove(b)}>
                              Remove
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

export default function GeoBlocksPage() {
  return (
    <RequireAuth>
      <GeoBlocks />
    </RequireAuth>
  );
}
