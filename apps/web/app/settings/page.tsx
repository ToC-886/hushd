"use client";

import Link from "next/link";
import { RequireAuth } from "@/components/require-auth";
import { useAuth } from "@/lib/auth-context";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const ITEMS = [
  {
    href: "/settings/verification",
    title: "Verification",
    description: "Age and identity verification status and start links.",
  },
  {
    href: "/billing",
    title: "Billing",
    description: "Payment history for subscriptions, PPV, and tips.",
  },
  {
    href: "/password-reset",
    title: "Change password",
    description: "Send yourself a password reset link.",
  },
] as const;

function SettingsIndex() {
  const { me } = useAuth();

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account</CardTitle>
          <CardDescription>
            {me?.email} · {me?.roles.join(", ").toLowerCase()}
          </CardDescription>
        </CardHeader>
      </Card>

      <ul className="flex flex-col gap-3">
        {ITEMS.map((item) => (
          <li key={item.href}>
            <Link href={item.href}>
              <Card className="transition-colors hover:border-zinc-600">
                <CardHeader>
                  <CardTitle className="text-base">{item.title}</CardTitle>
                  <CardDescription>{item.description}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <RequireAuth>
      <main className="mx-auto w-full max-w-2xl px-4 py-8">
        <h1 className="mb-6 text-2xl font-semibold">Settings</h1>
        <SettingsIndex />
      </main>
    </RequireAuth>
  );
}
