"use client";

import * as React from "react";
import Link from "next/link";
import { RequireAuth } from "@/components/require-auth";
import { get, ApiError } from "@/lib/api";
import type { FeedPost } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form-error";
import { FullPageSpinner } from "@/components/ui/spinner";
import { formatDateTime } from "@/lib/format";

function visibilityLabel(v: FeedPost["visibility"]): string {
  if (v === "PUBLIC") return "Public";
  if (v === "SUBSCRIBERS") return "Subscribers";
  return "Tier locked";
}

function PostCard({ post }: { post: FeedPost }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">
              <Link href={`/creators/${post.creator.slug}`} className="hover:underline">
                {post.creator.displayName ?? post.creator.slug}
              </Link>
            </CardTitle>
            <CardDescription>{formatDateTime(post.publishedAt)}</CardDescription>
          </div>
          <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-xs text-zinc-400">
            {visibilityLabel(post.visibility)}
          </span>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="whitespace-pre-wrap text-sm text-zinc-200">{post.body}</p>
        {post.media.length > 0 && (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {post.media.map((m) => (
              <li
                key={m.id}
                className="flex aspect-square items-center justify-center overflow-hidden rounded-md border border-zinc-800 bg-zinc-950 text-xs text-zinc-500"
              >
                {m.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.url} alt="" className="h-full w-full object-cover" />
                ) : m.streamUid ? (
                  <span>Video</span>
                ) : (
                  <span>Media</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function Feed() {
  const [posts, setPosts] = React.useState<FeedPost[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await get<FeedPost[]>("/feed/me");
        if (!cancelled) setPosts(data);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 403) {
          setError("Complete age verification to view your feed.");
        } else {
          setError("Could not load your feed. Try again.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="flex flex-col items-center gap-4 py-16">
        <FormError message={error} />
        <Link href="/settings/verification">
          <Button variant="secondary" size="sm">
            Go to verification
          </Button>
        </Link>
      </div>
    );
  }

  if (!posts) return <FullPageSpinner label="Loading your feed…" />;

  if (posts.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <h2 className="text-lg font-semibold">Nothing here yet</h2>
        <p className="max-w-md text-sm text-zinc-400">
          Posts from creators you subscribe to will appear here. Find a creator and subscribe to get
          started.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {posts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
    </div>
  );
}

export default function FeedPage() {
  return (
    <RequireAuth>
      <main className="mx-auto w-full max-w-2xl px-4 py-8">
        <h1 className="mb-6 text-2xl font-semibold">Your feed</h1>
        <Feed />
      </main>
    </RequireAuth>
  );
}
