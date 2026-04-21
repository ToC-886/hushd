export default function AdminHome() {
  const cards = [
    { title: "Moderation Queue", endpoint: "/v1/admin/moderation/queue", note: "Triage high-priority media/user reports." },
    { title: "Payout Approvals", endpoint: "/v1/admin/payouts/:payoutId/approve", note: "Approve creator payouts after risk checks." },
    { title: "Fraud Dashboard", endpoint: "/v1/admin/fraud/dashboard", note: "Track chargeback/refund anomaly trends." },
    { title: "Compliance Export", endpoint: "/v1/admin/compliance/export", note: "Generate records for legal review." },
    { title: "Risk Scoring", endpoint: "/v1/risk/payout/:creatorId", note: "Evaluate payout hold recommendation." },
  ];

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Admin operations plane</h1>
      <p className="text-zinc-400">
        Enterprise controls for moderation, payout approvals, fraud surveillance, and compliance exports.
      </p>
      <section className="grid gap-4 md:grid-cols-2">
        {cards.map((card) => (
          <article key={card.title} className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
            <h2 className="text-lg font-medium">{card.title}</h2>
            <p className="mt-2 text-sm text-zinc-400">{card.note}</p>
            <p className="mt-3 rounded bg-zinc-950/80 p-2 text-xs text-zinc-300">{card.endpoint}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
