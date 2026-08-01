"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { post, type AuthTokens } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FullPageSpinner } from "@/components/ui/spinner";

function VerifyEmail() {
  const params = useSearchParams();
  const router = useRouter();
  const { refreshMe } = useAuth();
  const token = params.get("token");

  const [state, setState] = React.useState<"working" | "done" | "error">("working");
  const [message, setMessage] = React.useState<string>("");

  React.useEffect(() => {
    if (!token) {
      setState("error");
      setMessage("This verification link is missing its token.");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const tokens = await post<AuthTokens>("/auth/verify-email", { token }, { skipAuthRetry: true });
        if (cancelled) return;
        if ("accessToken" in tokens) {
          // Verification activated the account and set the session cookies.
          await refreshMe();
        }
        setState("done");
      } catch {
        if (cancelled) return;
        setState("error");
        setMessage("That verification link is invalid or has expired. Request a new one.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, refreshMe]);

  if (state === "working") {
    return <FullPageSpinner label="Verifying your email…" />;
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>{state === "done" ? "Email verified" : "Verification failed"}</CardTitle>
        <CardDescription>
          {state === "done" ? "Your account is now active." : message}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex gap-3">
        {state === "done" ? (
          <Button onClick={() => router.replace("/feed")}>Continue</Button>
        ) : (
          <>
            <Link href="/verify-email/resend">
              <Button variant="secondary" size="sm">
                Resend link
              </Button>
            </Link>
            <Link href="/login">
              <Button variant="ghost" size="sm">
                Sign in
              </Button>
            </Link>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function VerifyEmailPage() {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-md items-center justify-center px-4 py-12">
      <React.Suspense fallback={<FullPageSpinner />}>
        <VerifyEmail />
      </React.Suspense>
    </main>
  );
}
