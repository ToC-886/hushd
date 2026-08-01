"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { FullPageSpinner } from "@/components/ui/spinner";

export default function Home() {
  const { isAuthenticated, isLoading, hasRole } = useAuth();

  if (isLoading) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-16">
        <FullPageSpinner />
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-4xl flex-col justify-center gap-6 px-6 py-16">
      <p className="text-sm uppercase tracking-wide text-zinc-500">hushd</p>
      <h1 className="text-4xl font-semibold tracking-tight">
        {isAuthenticated ? "Welcome back" : "Creator + fan platform"}
      </h1>
      <p className="max-w-xl text-zinc-400">
        Subscribe to creators, unlock pay-per-view messages, send tips, and enjoy
        verification-gated, moderation-aware content backed by a double-entry ledger.
      </p>

      <div className="flex flex-wrap gap-3">
        {isAuthenticated ? (
          <>
            <Link href="/feed">
              <Button>Go to your feed</Button>
            </Link>
            {hasRole("CREATOR") && (
              <Link href="/creator">
                <Button variant="secondary">Creator dashboard</Button>
              </Link>
            )}
          </>
        ) : (
          <>
            <Link href="/register">
              <Button>Join as fan</Button>
            </Link>
            <Link href="/register?role=creator">
              <Button variant="secondary">Become a creator</Button>
            </Link>
            <Link href="/login" className="self-center text-sm text-zinc-300 hover:text-zinc-100">
              Already have an account? Sign in
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
