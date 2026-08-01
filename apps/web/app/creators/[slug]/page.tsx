"use client"

import * as React from "react"
import { useParams, useRouter } from "next/navigation"
import { RequireAuth } from "@/components/require-auth"
import { get, post, ApiError } from "@/lib/api"
import type { CheckoutResult, FeedPost, SubscriptionTier } from "@/lib/types"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { FormError } from "@/components/ui/form-error"
import { FullPageSpinner, Spinner } from "@/components/ui/spinner"
import { formatCents, formatDateTime } from "@/lib/format"

type CreatorProfileDto = {
  userId: string
  slug: string
  displayName: string | null
  bio: string | null
  tiers: Array<Pick<SubscriptionTier, "id" | "title" | "description" | "priceCents" | "interval" | "trialDays">>
  activeSubscription: { id: string; tierId: string; status: string; currentPeriodEnd: string | null } | null
}

function PublicPostCard({ post }: { post: FeedPost }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <CardDescription>{formatDateTime(post.publishedAt)}</CardDescription>
          {post.visibility !== "PUBLIC" && (
            <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-xs text-zinc-400">
              Subscribers
            </span>
          )}
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
  )
}

function CreatorProfile() {
  const params = useParams<{ slug: string }>()
  const router = useRouter()
  const slug = params.slug

  const [profile, setProfile] = React.useState<CreatorProfileDto | null>(null)
  const [posts, setPosts] = React.useState<FeedPost[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [selectedTierId, setSelectedTierId] = React.useState<string>("")
  const [isSubscribing, setIsSubscribing] = React.useState(false)
  const [subscribeError, setSubscribeError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [profileData, feedData] = await Promise.all([
          get<CreatorProfileDto>(`/feed/creator/${encodeURIComponent(slug)}/profile`),
          get<FeedPost[]>(`/feed/creator/${encodeURIComponent(slug)}`),
        ])
        if (cancelled) return
        setProfile(profileData)
        setPosts(feedData)
        setSelectedTierId(profileData.tiers[0]?.id ?? "")
      } catch (err) {
        if (cancelled) return
        if (err instanceof ApiError && err.status === 404) {
          setError("Creator not found.")
        } else if (err instanceof ApiError && err.status === 403) {
          setError("Complete age verification to view creator content.")
        } else {
          setError("Could not load this creator. Try again.")
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [slug])

  const handleSubscribe = async () => {
    if (!selectedTierId) {
      setSubscribeError("Select a subscription tier first.")
      return
    }
    setSubscribeError(null)
    setIsSubscribing(true)
    try {
      const origin = window.location.origin
      const result = await post<CheckoutResult>("/billing/subscriptions/checkout", {
        creatorSlug: slug,
        tierId: selectedTierId,
        successReturnUrl: `${origin}/creators/${slug}?subscribed=1`,
        cancelReturnUrl: `${origin}/creators/${slug}`,
      })
      if (result.redirectUrl) {
        window.location.assign(result.redirectUrl)
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.message.includes("tier_not_found")) {
          setSubscribeError("That tier is no longer available. Refresh and try again.")
        } else if (err.status === 403) {
          setSubscribeError("Complete age verification before subscribing.")
        } else {
          setSubscribeError(err.message)
        }
      } else {
        setSubscribeError("Could not start checkout. Try again.")
      }
    } finally {
      setIsSubscribing(false)
    }
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-4 py-16">
        <FormError message={error} />
      </div>
    )
  }

  if (!profile || !posts) return <FullPageSpinner label="Loading creator…" />

  const creatorName = profile.displayName ?? profile.slug
  const isSubscribed = Boolean(profile.activeSubscription)

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{creatorName}</CardTitle>
          <CardDescription>@{profile.slug}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {profile.bio && <p className="text-sm text-zinc-300">{profile.bio}</p>}

          {isSubscribed ? (
            <p className="text-sm text-emerald-400">You are subscribed to this creator.</p>
          ) : profile.tiers.length === 0 ? (
            <p className="text-sm text-zinc-400">
              This creator has not set up subscription tiers yet.
            </p>
          ) : (
            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium text-zinc-200">Choose a tier</legend>
              {profile.tiers.map((tier) => (
                <label
                  key={tier.id}
                  className="flex cursor-pointer items-start gap-3 rounded-md border border-zinc-800 px-3 py-2 hover:border-zinc-600"
                >
                  <input
                    type="radio"
                    name="tier"
                    value={tier.id}
                    checked={selectedTierId === tier.id}
                    onChange={() => setSelectedTierId(tier.id)}
                    className="mt-1"
                  />
                  <span className="flex flex-col">
                    <span className="text-sm font-medium text-zinc-100">{tier.title}</span>
                    <span className="text-xs text-zinc-400">
                      {formatCents(tier.priceCents)} / {tier.interval.toLowerCase()}
                      {tier.trialDays > 0 ? ` · ${tier.trialDays}-day trial` : ""}
                    </span>
                    {tier.description && (
                      <span className="mt-1 text-xs text-zinc-500">{tier.description}</span>
                    )}
                  </span>
                </label>
              ))}
            </fieldset>
          )}

          <div className="flex flex-wrap gap-2">
            {!isSubscribed && profile.tiers.length > 0 && (
              <Button onClick={handleSubscribe} disabled={isSubscribing || !selectedTierId}>
                {isSubscribing ? <Spinner /> : "Subscribe"}
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={() =>
                router.push(`/messages?creator=${encodeURIComponent(profile.userId)}`)
              }
            >
              Message
            </Button>
          </div>
          <FormError message={subscribeError} />
        </CardContent>
      </Card>

      <section aria-label="Posts" className="flex flex-col gap-5">
        {posts.length === 0 ? (
          <p className="text-center text-sm text-zinc-400">No posts yet.</p>
        ) : (
          posts.map((p) => <PublicPostCard key={p.id} post={p} />)
        )}
      </section>
    </div>
  )
}

export default function CreatorPage() {
  return (
    <RequireAuth>
      <main className="mx-auto w-full max-w-2xl px-4 py-8">
        <CreatorProfile />
      </main>
    </RequireAuth>
  )
}
