import { Button } from "@/components/ui/button";

export default function Home() {
  const flows = [
    "Subscribe and manage recurring plans",
    "Unlock PPV messages and send tips",
    "Creator tier management and post publishing",
    "Verification-gated access and moderation-aware media delivery",
  ];

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 px-6 py-16">
      <p className="text-sm uppercase tracking-wide text-zinc-500">hushd</p>
      <h1 className="text-4xl font-semibold tracking-tight">Creator + fan experience shell</h1>
      <p className="text-zinc-400">
        Surface area now includes subscription billing, entitlement-aware feeds, messaging with PPV unlocks,
        and verification-gated actions backed by the API.
      </p>
      <ul className="grid gap-2 text-zinc-300">
        {flows.map((flow) => (
          <li key={flow} className="rounded border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-sm">
            {flow}
          </li>
        ))}
      </ul>
      <div className="flex gap-3">
        <Button>Join as Fan</Button>
        <Button variant="secondary">Creator Onboarding</Button>
      </div>
    </main>
  );
}
