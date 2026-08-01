"use client";

import * as React from "react";
import { RequireAuth } from "../../lib/require-auth";
import { useApiQuery } from "../../lib/use-api";
import type { ComplianceEvent } from "../../lib/types";
import { formatDateTime } from "../../lib/format";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { Spinner } from "../../components/ui/spinner";
import { FormError } from "../../components/ui/form-error";
import { Label } from "../../components/ui/label";

function Compliance() {
  const [limit, setLimit] = React.useState("200");
  const [query, setQuery] = React.useState("/admin/compliance/export?limit=200");
  const { data, isLoading, error } = useApiQuery<ComplianceEvent[]>(query);

  const handleApply = (event: React.FormEvent) => {
    event.preventDefault();
    const n = Math.max(1, Math.min(1000, Number(limit) || 200));
    setLimit(String(n));
    setQuery(`/admin/compliance/export?limit=${n}`);
  };

  const handleDownload = () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hushd-compliance-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Compliance export</h1>
          <p className="mt-1 text-sm text-slate-500">
            Immutable compliance events (verification, payout, geo-block, and audit trails).
          </p>
        </div>
        <Button variant="outline" onClick={handleDownload} disabled={!data || data.length === 0}>
          Download JSON
        </Button>
      </div>

      <form onSubmit={handleApply} className="flex flex-wrap items-end gap-3">
        <div className="flex w-32 flex-col gap-1.5">
          <Label htmlFor="limit">Limit</Label>
          <select
            id="limit"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
          >
            <option value="50">50</option>
            <option value="200">200</option>
            <option value="500">500</option>
            <option value="1000">1000</option>
          </select>
        </div>
        <Button type="submit">Apply</Button>
      </form>

      <FormError message={error} />

      {isLoading ? (
        <div className="flex h-48 items-center justify-center">
          <Spinner label="Loading compliance events" />
        </div>
      ) : !data || data.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-slate-500">
            No compliance events found.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3 font-medium">Time</th>
                    <th className="px-4 py-3 font-medium">Event</th>
                    <th className="px-4 py-3 font-medium">Jurisdiction</th>
                    <th className="px-4 py-3 font-medium">Subject</th>
                    <th className="px-4 py-3 font-medium">Payload</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((ev) => (
                    <tr key={ev.id} className="border-b border-slate-100 last:border-0 align-top">
                      <td className="px-4 py-3 whitespace-nowrap text-slate-600">{formatDateTime(ev.occurredAt)}</td>
                      <td className="px-4 py-3">
                        <Badge variant="secondary">{ev.eventType}</Badge>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">{ev.jurisdiction ?? "—"}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-400">
                        {ev.creatorId ?? ev.userId ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <pre className="max-w-md overflow-x-auto rounded bg-slate-50 p-2 text-xs text-slate-600">
                          {JSON.stringify(ev.payload, null, 2)}
                        </pre>
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

export default function CompliancePage() {
  return (
    <RequireAuth>
      <Compliance />
    </RequireAuth>
  );
}
