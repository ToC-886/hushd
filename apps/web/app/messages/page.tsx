"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { RequireAuth } from "@/components/require-auth";
import { get, post, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { Conversation, Message } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormError } from "@/components/ui/form-error";
import { FullPageSpinner, Spinner } from "@/components/ui/spinner";
import { formatCents, formatDateTime } from "@/lib/format";

function MessageBubble({
  message,
  isOwn,
  onUnlock,
  isUnlocking,
}: {
  message: Message;
  isOwn: boolean;
  onUnlock: (id: string) => void;
  isUnlocking: boolean;
}) {
  if (message.locked) {
    return (
      <div className="flex justify-start">
        <div className="max-w-[80%] rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3">
          <p className="text-sm text-zinc-400">Locked pay-per-view message</p>
          {message.ppv && (
            <Button
              size="sm"
              className="mt-2"
              onClick={() => onUnlock(message.id)}
              disabled={isUnlocking}
            >
              {isUnlocking ? <Spinner /> : `Unlock for ${formatCents(message.ppv.priceCents, message.ppv.currency)}`}
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-lg px-4 py-2 text-sm ${
          isOwn ? "bg-zinc-100 text-zinc-900" : "bg-zinc-800 text-zinc-100"
        }`}
      >
        <p className="whitespace-pre-wrap">{message.body}</p>
        <p className={`mt-1 text-xs ${isOwn ? "text-zinc-500" : "text-zinc-400"}`}>
          {formatDateTime(message.createdAt)}
        </p>
      </div>
    </div>
  );
}

function ConversationView({ creatorId }: { creatorId: string }) {
  const { me } = useAuth();
  const [convo, setConvo] = React.useState<Conversation | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [body, setBody] = React.useState("");
  const [isSending, setIsSending] = React.useState(false);
  const [unlockingId, setUnlockingId] = React.useState<string | null>(null);
  const [tipAmount, setTipAmount] = React.useState("");
  const [isTipping, setIsTipping] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [actionNotice, setActionNotice] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      const data = await get<Conversation | { messages: [] }>(
        `/messages/conversation/${encodeURIComponent(creatorId)}`,
      );
      setConvo("id" in data ? data : null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setError("An active subscription is required to message this creator.");
      } else {
        setError("Could not load the conversation. Try again.");
      }
    }
  }, [creatorId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    setActionError(null);
    setIsSending(true);
    try {
      await post("/messages/send", { creatorId, body: body.trim() });
      setBody("");
      await load();
    } catch (err) {
      setActionError(
        err instanceof ApiError && err.message.includes("active_subscription_required")
          ? "An active subscription is required to send messages."
          : "Message could not be sent. Try again.",
      );
    } finally {
      setIsSending(false);
    }
  };

  const handleUnlock = async (messageId: string) => {
    setActionError(null);
    setUnlockingId(messageId);
    try {
      await post(`/messages/${encodeURIComponent(messageId)}/unlock`);
      setActionNotice("Message unlocked.");
      await load();
    } catch {
      setActionError("Could not unlock this message. Try again.");
    } finally {
      setUnlockingId(null);
    }
  };

  const handleTip = async (e: React.FormEvent) => {
    e.preventDefault();
    const cents = Math.round(Number(tipAmount) * 100);
    if (!Number.isFinite(cents) || cents <= 0) {
      setActionError("Enter a valid tip amount.");
      return;
    }
    setActionError(null);
    setActionNotice(null);
    setIsTipping(true);
    try {
      await post("/messages/tips", { creatorId, amountCents: cents });
      setTipAmount("");
      setActionNotice("Tip sent. Thank you!");
    } catch {
      setActionError("Tip could not be sent. Try again.");
    } finally {
      setIsTipping(false);
    }
  };

  if (error) {
    return (
      <div className="py-10">
        <FormError message={error} />
      </div>
    );
  }

  if (!convo) {
    return (
      <div className="py-10 text-center text-sm text-zinc-400">
        No conversation yet. Send a message below to start one.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Conversation</CardTitle>
          <CardDescription>{convo.messages.length} messages</CardDescription>
        </CardHeader>
        <CardContent className="flex max-h-[50vh] flex-col gap-3 overflow-y-auto">
          {convo.messages.length === 0 ? (
            <p className="py-6 text-center text-sm text-zinc-400">No messages yet.</p>
          ) : (
            convo.messages.map((m) => (
              <MessageBubble
                key={m.id}
                message={m}
                isOwn={m.senderUserId === me?.id}
                onUnlock={handleUnlock}
                isUnlocking={unlockingId === m.id}
              />
            ))
          )}
        </CardContent>
      </Card>

      <form onSubmit={handleSend} className="flex gap-2">
        <Input
          aria-label="Message"
          placeholder="Write a message…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <Button type="submit" disabled={isSending || !body.trim()}>
          {isSending ? <Spinner /> : "Send"}
        </Button>
      </form>

      <form onSubmit={handleTip} className="flex items-end gap-2">
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor="tip">Send a tip</Label>
          <Input
            id="tip"
            inputMode="decimal"
            placeholder="5.00"
            value={tipAmount}
            onChange={(e) => setTipAmount(e.target.value)}
          />
        </div>
        <Button type="submit" variant="secondary" disabled={isTipping}>
          {isTipping ? <Spinner /> : "Tip"}
        </Button>
      </form>

      <FormError message={actionError} />
      {actionNotice && <p className="text-sm text-emerald-400">{actionNotice}</p>}
    </div>
  );
}

function MessagesInner() {
  const params = useSearchParams();
  const creatorId = params.get("creator");

  if (!creatorId) {
    return (
      <div className="py-10 text-center text-sm text-zinc-400">
        Open a creator&apos;s page and choose “Message” to start a conversation.
      </div>
    );
  }

  return <ConversationView creatorId={creatorId} />;
}

export default function MessagesPage() {
  return (
    <RequireAuth>
      <main className="mx-auto w-full max-w-2xl px-4 py-8">
        <h1 className="mb-6 text-2xl font-semibold">Messages</h1>
        <React.Suspense fallback={<FullPageSpinner />}>
          <MessagesInner />
        </React.Suspense>
      </main>
    </RequireAuth>
  );
}
