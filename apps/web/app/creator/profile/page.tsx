"use client";

import * as React from "react";
import { RequireAuth } from "@/components/require-auth";
import { patch, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormError } from "@/components/ui/form-error";
import { Spinner } from "@/components/ui/spinner";

function ProfileForm() {
  const [displayName, setDisplayName] = React.useState("");
  const [bio, setBio] = React.useState("");
  const [countryCode, setCountryCode] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);

    const code = countryCode.trim().toUpperCase();
    if (code && !/^[A-Z]{2}$/.test(code)) {
      setError("Country code must be a 2-letter ISO code (e.g. DE, US).");
      return;
    }

    setIsSaving(true);
    try {
      await patch("/creator/profile", {
        displayName: displayName.trim() || undefined,
        bio: bio.trim() || undefined,
        countryCode: code || undefined,
      });
      setNotice("Profile updated.");
    } catch (err) {
      if (err instanceof ApiError && err.message.includes("creator_profile_required")) {
        setError("A creator profile is required. Contact support to finish onboarding.");
      } else {
        setError("Could not save your profile. Try again.");
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Public profile</CardTitle>
        <CardDescription>
          Your display name, bio, and payout country. Country changes are audit-logged.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-2">
            <Label htmlFor="displayName">Display name</Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={80}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="bio">Bio</Label>
            <textarea
              id="bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={4}
              maxLength={2000}
              className="flex w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="country">Payout country (ISO 3166-1 alpha-2)</Label>
            <Input
              id="country"
              value={countryCode}
              onChange={(e) => setCountryCode(e.target.value.toUpperCase())}
              placeholder="DE"
              maxLength={2}
              className="w-24 uppercase"
            />
            <p className="text-xs text-zinc-500">
              Determines payout eligibility under geo-block rules.
            </p>
          </div>
          <FormError message={error} />
          {notice && <p className="text-sm text-emerald-400">{notice}</p>}
          <Button type="submit" disabled={isSaving} className="self-start">
            {isSaving ? <Spinner /> : "Save profile"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export default function CreatorProfilePage() {
  return (
    <RequireAuth role="CREATOR">
      <main className="mx-auto w-full max-w-2xl px-4 py-8">
        <h1 className="mb-6 text-2xl font-semibold">Profile</h1>
        <ProfileForm />
      </main>
    </RequireAuth>
  );
}
