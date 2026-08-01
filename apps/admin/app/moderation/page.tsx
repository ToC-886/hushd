"use client";

import * as React from "react";
import { post, ApiError } from "../../lib/api";
import { RequireAuth } from "../../lib/require-auth";
import { useApiQuery } from "../../lib/use-api";
import type { ModerationQueueItem } from "../../lib/types";
import { formatDateTime } from "../../lib/format";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Spinner } from "../../components/ui/spinner";
import { FormError } from "../../components/ui/form-error";

function statusVariant(status: string): "warning" | "secondary" | "success" {
  if (status === "PENDING") return "warning";
  if (status === "RESOLVED") return "success";
  return "secondary";
}

function Moderation() {
  const { data, isLoading, error, refetch } = useApiQuery<ModerationQueueItem[]>("/admin/moderation/queue");
  const [resolvingId, setResolvingId] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);

  const handleResolve = async (id: string) => {
    setActionError(null);
    setResolvingId(id);
    try {
      await post(`/admin/moderation/queue/${id}/resolve`);
      refetch();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Failed to resolve item.");
    } finally {
      setResolvingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner label="Loading moderation queue" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Moderation queue</h1>
        <p className="mt-1 text-sm text-slate-500">
          Triage reported media and accounts. Resolving marks the item handled.
        </p>
      </div>
      <FormError message={error ?? actionError} />
      {!data || data.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-slate-500">
            The moderation queue is empty.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {data.map((item) => (
            <Card key={item.id}>
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                <div>
                  <CardTitle className="text-base">
                    {item.targetType} <span className="font-mono text-xs text-slate-400">{item.targetId}</span>
                  </CardTitle>
                  <CardDescription>{item.reason}</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">priority {item.priority}</Badge>
                  <Badge variant={statusVariant(item.status)}>{item.status}</Badge>
                </div>
              </CardHeader>
              <CardContent className="flex items-center justify-between pt-0">
                <span className="text-xs text-slate-500">Reported {formatDateTime(item.createdAt)}</span>
                <Button
                  size="sm"
                  onClick={() => handleResolve(item.id)}
                  disabled={resolvingId === item.id}
                >
                  {resolvingId === item.id ? "Resolving…" : "Resolve"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ModerationPage() {
  return (
    <RequireAuth>
      <Moderation />
    </RequireAuth>
  );
}
