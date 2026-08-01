"use client";

import * as React from "react";
import { post, ApiError } from "../../lib/api";
import { RequireAuth } from "../../lib/require-auth";
import { useApiQuery } from "../../lib/use-api";
import type { DmcaRequest } from "../../lib/types";
import { formatDateTime } from "../../lib/format";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Spinner } from "../../components/ui/spinner";
import { FormError } from "../../components/ui/form-error";
import { cn } from "../../lib/utils";

type DmcaStatus = "RECEIVED" | "UNDER_REVIEW" | "ACTIONED" | "REJECTED" | "CLOSED";
const STATUSES: DmcaStatus[] = ["RECEIVED", "UNDER_REVIEW", "ACTIONED", "REJECTED", "CLOSED"];

const FILTERS: { id: string; label: string }[] = [
  { id: "OPEN", label: "Open" },
  ...STATUSES.map((s) => ({ id: s, label: s.replace("_", " ") })),
];

function statusVariant(status: string): "warning" | "secondary" | "success" | "destructive" | "default" {
  if (status === "RECEIVED") return "warning";
  if (status === "UNDER_REVIEW") return "default";
  if (status === "ACTIONED" || status === "CLOSED") return "success";
  if (status === "REJECTED") return "destructive";
  return "secondary";
}

function Dmca() {
  const [filter, setFilter] = React.useState<string>("OPEN");
  const path = filter === "OPEN" ? "/admin/dmca" : `/admin/dmca?status=${filter}`;
  const { data, isLoading, error, refetch } = useApiQuery<DmcaRequest[]>(path);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);

  const handleUpdate = async (req: DmcaRequest, status: DmcaStatus) => {
    setActionError(null);
    setBusyId(req.id);
    try {
      await post(`/admin/dmca/${req.id}/status`, { status, legalHold: req.legalHold });
      refetch();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Failed to update request.");
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleLegalHold = async (req: DmcaRequest) => {
    setActionError(null);
    setBusyId(req.id);
    try {
      await post(`/admin/dmca/${req.id}/status`, {
        status: req.status,
        legalHold: !req.legalHold,
      });
      refetch();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Failed to update legal hold.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">DMCA requests</h1>
        <p className="mt-1 text-sm text-slate-500">
          Track takedown requests through review and resolution. Legal hold preserves related records.
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
          <Spinner label="Loading DMCA requests" />
        </div>
      ) : !data || data.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-slate-500">
            No DMCA requests match this filter.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {data.map((req) => (
            <Card key={req.id}>
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                <div>
                  <CardTitle className="text-base">{req.reporterEmail}</CardTitle>
                  <CardDescription>
                    {req.reporterName ?? "—"} · {formatDateTime(req.createdAt)}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  {req.legalHold ? <Badge variant="destructive">Legal hold</Badge> : null}
                  <Badge variant={statusVariant(req.status)}>{req.status.replace("_", " ")}</Badge>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 pt-0">
                <p className="text-sm text-slate-700">{req.description}</p>
                {req.targetUrl ? (
                  <a
                    href={req.targetUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="break-all text-xs text-slate-500 underline"
                  >
                    {req.targetUrl}
                  </a>
                ) : null}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-slate-500">Set status:</span>
                  {STATUSES.filter((s) => s !== req.status).map((s) => (
                    <Button
                      key={s}
                      size="sm"
                      variant="outline"
                      onClick={() => handleUpdate(req, s)}
                      disabled={busyId === req.id}
                    >
                      {s.replace("_", " ")}
                    </Button>
                  ))}
                  <span className="mx-1 h-4 w-px bg-slate-200" />
                  <Button
                    size="sm"
                    variant={req.legalHold ? "destructive" : "secondary"}
                    onClick={() => handleToggleLegalHold(req)}
                    disabled={busyId === req.id}
                  >
                    {req.legalHold ? "Release hold" : "Legal hold"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DmcaPage() {
  return (
    <RequireAuth>
      <Dmca />
    </RequireAuth>
  );
}
