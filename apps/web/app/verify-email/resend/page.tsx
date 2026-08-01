"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { post } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";

function ResendForm() {
  const params = useSearchParams();
  const [email, setEmail] = React.useState(params.get("email") ?? "");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [sent, setSent] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await post("/auth/verify-email/resend", { email }, { skipAuthRetry: true });
    } catch {
      // enumeration-safe: show the same confirmation regardless
    } finally {
      setIsSubmitting(false);
      setSent(true);
    }
  };

  if (sent) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Check your inbox</CardTitle>
          <CardDescription>
            If an account exists for <span className="text-zinc-200">{email}</span>, a new
            verification link is on its way.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/login">
            <Button variant="secondary" size="sm">
              Back to sign in
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Resend verification</CardTitle>
        <CardDescription>We will email you a fresh verification link.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
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
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? <Spinner /> : "Send link"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export default function ResendPage() {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-md items-center justify-center px-4 py-12">
      <React.Suspense fallback={<Spinner />}>
        <ResendForm />
      </React.Suspense>
    </main>
  );
}
