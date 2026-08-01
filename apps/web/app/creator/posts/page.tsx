"use client";

import * as React from "react";
import { RequireAuth } from "@/components/require-auth";
import { get, post, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { FeedPost, SubscriptionTier } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FormError } from "@/components/ui/form-error";
import { FullPageSpinner, Spinner } from "@/components/ui/spinner";
import { formatDateTime } from "@/lib/format";

type Visibility = "PUBLIC" | "SUBSCRIBERS" | "TIER_LOCKED";

type UploadState =
  | { status: "idle" }
  | { status: "uploading"; fileName: string }
  | { status: "scanning"; mediaId: string }
  | { status: "ready"; mediaId: string }
  | { status: "error"; message: string };

function mediaTypeFor(file: File): "IMAGE" | "VIDEO" | "AUDIO" | "OTHER" {
  if (file.type.startsWith("image/")) return "IMAGE";
  if (file.type.startsWith("video/")) return "VIDEO";
  if (file.type.startsWith("audio/")) return "AUDIO";
  return "OTHER";
}

function Posts() {
  const { me } = useAuth();
  const [posts, setPosts] = React.useState<FeedPost[] | null>(null);
  const [tiers, setTiers] = React.useState<SubscriptionTier[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  const [body, setBody] = React.useState("");
  const [visibility, setVisibility] = React.useState<Visibility>("SUBSCRIBERS");
  const [lockedTierId, setLockedTierId] = React.useState("");
  const [upload, setUpload] = React.useState<UploadState>({ status: "idle" });
  const [formError, setFormError] = React.useState<string | null>(null);
  const [isPublishing, setIsPublishing] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!me?.creatorSlug) return;
    try {
      const [postsData, tiersData] = await Promise.all([
        get<FeedPost[]>(`/feed/creator/${encodeURIComponent(me.creatorSlug)}`),
        get<SubscriptionTier[]>("/creator/tiers"),
      ]);
      setPosts(postsData);
      setTiers(tiersData.filter((t) => t.active));
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setError("Complete identity verification to publish content.");
      } else {
        setError("Could not load your posts. Try again.");
      }
    }
  }, [me?.creatorSlug]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !me) return;
    setUpload({ status: "uploading", fileName: file.name });
    try {
      const mediaType = mediaTypeFor(file);
      const init = await post<{
        mediaId: string;
        stagingKey: string;
        uploadUrl: string;
        headers: Record<string, string>;
      }>("/media/uploads/init", {
        ownerCreatorId: me.id,
        mediaType,
        contentType: file.type || undefined,
        byteSize: file.size,
      });

      const put = await fetch(init.uploadUrl, {
        method: "PUT",
        headers: init.headers,
        body: file,
      });
      if (!put.ok) {
        throw new Error(`upload failed (${put.status})`);
      }

      await post("/media/uploads/complete", {
        mediaId: init.mediaId,
        ownerCreatorId: me.id,
        stagingKey: init.stagingKey,
        mediaType,
        contentType: file.type || undefined,
      });

      setUpload({ status: "scanning", mediaId: init.mediaId });

      // Poll until the scan/promote pipeline finishes (bounded).
      const started = Date.now();
      const poll = async (): Promise<void> => {
        const status = await get<{ scanStatus: string; ready: boolean }>(
          `/media/${encodeURIComponent(init.mediaId)}`,
        );
        if (status.ready) {
          setUpload({ status: "ready", mediaId: init.mediaId });
          return;
        }
        if (status.scanStatus === "BLOCKED" || status.scanStatus === "QUARANTINED") {
          setUpload({ status: "error", message: "This file did not pass the safety scan." });
          return;
        }
        if (Date.now() - started > 90_000) {
          setUpload({ status: "error", message: "Scanning is taking longer than expected. Try again shortly." });
          return;
        }
        setTimeout(() => void poll(), 2000);
      };
      void poll();
    } catch (err) {
      setUpload({
        status: "error",
        message: err instanceof ApiError ? err.message : "Upload failed. Try a different file.",
      });
    } finally {
      e.target.value = "";
    }
  };

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!body.trim() && upload.status !== "ready") {
      setFormError("Write something or attach a file first.");
      return;
    }
    if (visibility === "TIER_LOCKED" && !lockedTierId) {
      setFormError("Choose which tier unlocks this post.");
      return;
    }

    setIsPublishing(true);
    try {
      await post("/creator/posts", {
        body: body.trim() || undefined,
        visibility,
        lockedTierId: visibility === "TIER_LOCKED" ? lockedTierId : undefined,
        mediaIds: upload.status === "ready" ? [upload.mediaId] : undefined,
      });
      setBody("");
      setVisibility("SUBSCRIBERS");
      setLockedTierId("");
      setUpload({ status: "idle" });
      await load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Could not publish. Try again.");
    } finally {
      setIsPublishing(false);
    }
  };

  if (error) {
    return (
      <div className="py-10">
        <FormError message={error} />
      </div>
    );
  }

  if (!posts) return <FullPageSpinner label="Loading posts…" />;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">New post</CardTitle>
          <CardDescription>Publish to your subscribers or the public.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePublish} className="flex flex-col gap-4" noValidate>
            <div className="flex flex-col gap-2">
              <Label htmlFor="body">Post</Label>
              <textarea
                id="body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={4}
                maxLength={5000}
                placeholder="What's new?"
                className="flex w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="visibility">Visibility</Label>
                <select
                  id="visibility"
                  value={visibility}
                  onChange={(e) => setVisibility(e.target.value as Visibility)}
                  className="flex h-10 w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
                >
                  <option value="PUBLIC">Public</option>
                  <option value="SUBSCRIBERS">Subscribers</option>
                  <option value="TIER_LOCKED">Tier locked</option>
                </select>
              </div>
              {visibility === "TIER_LOCKED" && (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="tier">Unlocking tier</Label>
                  <select
                    id="tier"
                    value={lockedTierId}
                    onChange={(e) => setLockedTierId(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
                  >
                    <option value="">Select tier…</option>
                    {tiers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="file">Attach media (optional)</Label>
              <input
                id="file"
                type="file"
                accept="image/*,video/*,audio/*"
                onChange={handleFile}
                className="text-sm text-zinc-400 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-800 file:px-3 file:py-2 file:text-sm file:text-zinc-100 hover:file:bg-zinc-700"
              />
              {upload.status === "uploading" && (
                <p className="text-xs text-zinc-400">Uploading {upload.fileName}…</p>
              )}
              {upload.status === "scanning" && (
                <p className="flex items-center gap-2 text-xs text-zinc-400">
                  <Spinner /> Running safety scan…
                </p>
              )}
              {upload.status === "ready" && (
                <p className="text-xs text-emerald-400">Attachment ready.</p>
              )}
              {upload.status === "error" && (
                <p className="text-xs text-red-400">{upload.message}</p>
              )}
            </div>

            <FormError message={formError} />
            <Button
              type="submit"
              disabled={isPublishing || upload.status === "uploading" || upload.status === "scanning"}
              className="self-start"
            >
              {isPublishing ? <Spinner /> : "Publish"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <section aria-label="Published posts" className="flex flex-col gap-4">
        <h2 className="text-sm font-medium text-zinc-400">{posts.length} published</h2>
        {posts.length === 0 ? (
          <p className="py-4 text-center text-sm text-zinc-400">No posts yet.</p>
        ) : (
          posts.map((p) => (
            <Card key={p.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardDescription>{formatDateTime(p.publishedAt)}</CardDescription>
                  <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-xs text-zinc-400">
                    {p.visibility === "PUBLIC"
                      ? "Public"
                      : p.visibility === "SUBSCRIBERS"
                        ? "Subscribers"
                        : "Tier locked"}
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm text-zinc-200">{p.body}</p>
                {p.media.length > 0 && (
                  <ul className="mt-3 grid grid-cols-3 gap-2">
                    {p.media.map((m) => (
                      <li
                        key={m.id}
                        className="flex aspect-square items-center justify-center overflow-hidden rounded-md border border-zinc-800 bg-zinc-950 text-xs text-zinc-500"
                      >
                        {m.url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={m.url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <span>Media</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </section>
    </div>
  );
}

export default function CreatorPostsPage() {
  return (
    <RequireAuth role="CREATOR">
      <main className="mx-auto w-full max-w-2xl px-4 py-8">
        <h1 className="mb-6 text-2xl font-semibold">Posts</h1>
        <Posts />
      </main>
    </RequireAuth>
  );
}
