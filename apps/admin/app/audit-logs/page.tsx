"use client";

import * as React from "react";
import { RequireAuth } from "../../lib/require-auth";
import { useApiQuery } from "../../lib/use-api";
import type { AuditLog } from "../../lib/types";
import { formatDateTime } from "../../lib/format";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { Spinner } from "../../components/ui/spinner";
import { FormError } from "../../components/ui/form-error";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";

function AuditLogs() {
  const [entityType, setEntityType] = React.useState("");
  const [entityId, setEntityId] = React.useState("");
  const [query, setQuery] = React.useState("/admin/audit-logs");
  const { data, isLoading, error } = useApiQuery<AuditLog[]>(query);

  const handleFilter = (event: React.FormEvent) => {
    event.preventDefault();
    const params = new URLSearchParams();
    if (entityType.trim()) params.set("entityType", entityType.trim());
    if (entityId.trim()) params.set("entityId", entityId.trim());
    params.set("take", "200");
    setQuery(`/admin/audit-logs?${params.toString()}`);
  };

  const handleReset = () => {
    setEntityType("");
    setEntityId("");
    setQuery("/admin/audit-logs");
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Audit logs</h1>
        <p className="mt-1 text-sm text-slate-500">
          Immutable record of admin and system actions across the platform.
        </p>
      </div>

      <form onSubmit={handleFilter} className="flex flex-wrap items-end gap-3">
        <div className="flex w-48 flex-col gap-1.5">
          <Label htmlFor="et">Entity type</Label>
          <Input
            id="et"
            value={entityType}
            onChange={(e) => setEntityType(e.target.value)}
            placeholder="payout, geo_block…"
          />
        </div>
        <div className="flex w-64 flex-col gap-1.5">
          <Label htmlFor="ei">Entity ID</Label>
          <Input id="ei" value={entityId} onChange={(e) => setEntityId(e.target.value)} placeholder="optional" />
        </div>
        <Button type="submit">Filter</Button>
        <Button type="button" variant="outline" onClick={handleReset}>
          Reset
        </Button>
      </form>

      <FormError message={error} />

      {isLoading ? (
        <div className="flex h-48 items-center justify-center">
          <Spinner label="Loading audit logs" />
        </div>
      ) : !data || data.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-slate-500">
            No audit log entries found.
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
                    <th className="px-4 py-3 font-medium">Action</th>
                    <th className="px-4 py-3 font-medium">Actor</th>
                    <th className="px-4 py-3 font-medium">Entity</th>
                    <th className="px-4 py-3 font-medium">Diff</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((log) => (
                    <tr key={log.id} className="border-b border-slate-100 last:border-0 align-top">
                      <td className="px-4 py-3 whitespace-nowrap text-slate-600">{formatDateTime(log.createdAt)}</td>
                      <td className="px-4 py-3">
                        <Badge variant="secondary">{log.action}</Badge>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        <div>{log.actorType}</div>
                        <div className="font-mono text-xs text-slate-400">
                          {log.actorAdminId ?? log.actorUserId ?? "system"}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        <div>{log.entityType}</div>
                        <div className="font-mono text-xs text-slate-400">{log.entityId}</div>
                      </td>
                      <td className="px-4 py-3">
                        <pre className="max-w-md overflow-x-auto rounded bg-slate-50 p-2 text-xs text-slate-600">
                          {JSON.stringify(log.diff, null, 2)}
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

export default function AuditLogsPage() {
  return (
    <RequireAuth>
      <AuditLogs />
    </RequireAuth>
  );
}
