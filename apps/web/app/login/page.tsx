"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormError } from "@/components/ui/form-error";
import { Spinner } from "@/components/ui/spinner";

function LoginForm() {
  const { login } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/feed";

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [totpCode, setTotpCode] = React.useState("");
  const [needsTotp, setNeedsTotp] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await login({ email, password, totpCode: needsTotp ? totpCode : undefined });
      router.replace(next);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "totp_required" || err.message.includes("totp_required")) {
          setNeedsTotp(true);
          setError("Enter the 6-digit code from your authenticator app.");
        } else if (err.code === "invalid_totp" || err.message.includes("invalid_totp")) {
          setNeedsTotp(true);
          setError("That authenticator code was not correct. Try again.");
        } else if (err.message.includes("email_not_verified")) {
          setError("Verify your email before signing in. Check your inbox for the link.");
        } else {
          setError("Invalid email or password.");
        }
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>Access your hushd account.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {needsTotp && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="totp">Authenticator code</Label>
              <Input
                id="totp"
                name="totp"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                placeholder="123456"
                autoComplete="one-time-code"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
              />
            </div>
          )}

          <FormError message={error} />

          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? <Spinner /> : "Sign in"}
          </Button>
        </form>

        <div className="mt-4 flex flex-col gap-2 text-sm text-zinc-400">
          <Link href="/password-reset" className="hover:text-zinc-100">
            Forgot your password?
          </Link>
          <span>
            No account?{" "}
            <Link href="/register" className="text-zinc-200 hover:text-zinc-100">
              Create one
            </Link>
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-md items-center justify-center px-4 py-12">
      <React.Suspense fallback={<Spinner />}>
        <LoginForm />
      </React.Suspense>
    </main>
  );
}
