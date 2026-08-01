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

function RegisterForm() {
  const { register } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const initialRole = params.get("role") === "creator" ? "CREATOR" : "FAN";

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [role, setRole] = React.useState<"FAN" | "CREATOR">(initialRole);
  const [error, setError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [pendingEmail, setPendingEmail] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 12) {
      setError("Password must be at least 12 characters.");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await register({ email, password, role });
      if ("pendingVerification" in result) {
        setPendingEmail(result.user.email);
      } else {
        router.replace("/feed");
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message.includes("email") ? "That email is already registered or invalid." : err.message);
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (pendingEmail) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Verify your email</CardTitle>
          <CardDescription>
            We sent a verification link to <span className="text-zinc-200">{pendingEmail}</span>.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-zinc-400">
            Click the link in that email to activate your account. The link expires in 24 hours.
            You can sign in once your email is verified.
          </p>
          <div className="flex gap-3">
            <Link href={`/verify-email/resend?email=${encodeURIComponent(pendingEmail)}`}>
              <Button variant="secondary" size="sm">
                Resend link
              </Button>
            </Link>
            <Link href="/login">
              <Button variant="ghost" size="sm">
                Go to sign in
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Create your account</CardTitle>
        <CardDescription>Join hushd as a fan or a creator.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium text-zinc-200">I am a…</legend>
            <div className="flex gap-2">
              {(["FAN", "CREATOR"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  aria-pressed={role === r}
                  className={
                    role === r
                      ? "flex-1 rounded-md border border-zinc-200 bg-zinc-800 px-3 py-2 text-sm font-medium text-zinc-100"
                      : "flex-1 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-400 hover:text-zinc-100"
                  }
                >
                  {r === "FAN" ? "Fan" : "Creator"}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
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
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              aria-describedby="password-hint"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p id="password-hint" className="text-xs text-zinc-500">
              At least 12 characters.
            </p>
          </div>

          <FormError message={error} />

          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? <Spinner /> : "Create account"}
          </Button>
        </form>

        <p className="mt-4 text-sm text-zinc-400">
          Already have an account?{" "}
          <Link href="/login" className="text-zinc-200 hover:text-zinc-100">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

export default function RegisterPage() {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-md items-center justify-center px-4 py-12">
      <React.Suspense fallback={<Spinner />}>
        <RegisterForm />
      </React.Suspense>
    </main>
  );
}
