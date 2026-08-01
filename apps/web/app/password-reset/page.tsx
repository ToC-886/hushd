"use client";

import * as React from "react";
import Link from "next/link";
import { post } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";

export default function PasswordResetRequestPage() {
  const [email, setEmail] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [sent, setSent] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await post("/auth/password-reset/request", { email }, { skipAuthRetry: true });
    } catch {
      // enumeration-safe: identical confirmation either way
    } finally {
      setIsSubmitting(false);
      setSent(true);
    }
  };

  return (
    <main className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-md items-center justify-center px-4 py-12">
      {sent ? (
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Check your inbox</CardTitle>
            <CardDescription>
              If an account exists for <span className="text-zinc-200">{email}</span>, a password
              reset link is on its way. The link expires in 1 hour.
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
      ) : (
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Reset your password</CardTitle>
            <CardDescription>Enter your account email and we will send a reset link.</CardDescription>
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
                {isSubmitting ? <Spinner /> : "Send reset link"}
              </Button>
            </form>
            <p className="mt-4 text-sm text-zinc-400">
              Remembered it?{" "}
              <Link href="/login" className="text-zinc-200 hover:text-zinc-100">
                Sign in
              </Link>
            </p>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
