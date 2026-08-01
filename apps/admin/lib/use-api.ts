"use client";

import * as React from "react";
import { get, ApiError } from "./api";

/**
 * Small read-hook for admin GET endpoints: loads on mount (and when `path`
 * changes), exposes loading/error state and a manual `refetch`.
 */
export function useApiQuery<T>(path: string | null) {
  const [data, setData] = React.useState<T | null>(null);
  const [isLoading, setIsLoading] = React.useState(Boolean(path));
  const [error, setError] = React.useState<string | null>(null);
  const [tick, setTick] = React.useState(0);

  const refetch = React.useCallback(() => setTick((t) => t + 1), []);

  React.useEffect(() => {
    if (!path) {
      setData(null);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    get<T>(path)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Failed to load.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path, tick]);

  return { data, isLoading, error, refetch };
}
