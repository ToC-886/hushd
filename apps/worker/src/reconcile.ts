/**
 * Settlement reconciliation stub loop.
 * Real implementation should query processor APIs and compare totals
 * to internal ledger + transaction tables, then emit discrepancy alerts.
 */
export function startBillingReconciliationLoop() {
  const intervalMs = Number(process.env.RECONCILIATION_INTERVAL_MS ?? 10 * 60 * 1000);
  const enabled = process.env.RECONCILIATION_ENABLED !== "false";
  if (!enabled) return;

  const runOnce = () => {
    const lookbackHours = Number(process.env.RECONCILIATION_LOOKBACK_HOURS ?? 24);
    // eslint-disable-next-line no-console
    console.log("reconciliation_tick", { lookbackHours, at: new Date().toISOString() });
  };

  runOnce();
  setInterval(runOnce, intervalMs).unref();
}
