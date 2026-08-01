/**
 * Worker-side alerting: after repeated job failures inside a sliding window,
 * fire one alert per cooldown period. Posts to ALERT_WEBHOOK_URL when set,
 * otherwise logs an error line that log-based alerting can scrape.
 */

const WINDOW_MS = 10 * 60 * 1000;
const THRESHOLD = 3;
const COOLDOWN_MS = 30 * 60 * 1000;

type FailureRecord = {
  count: number;
  windowStart: number;
  lastAlertAt: number;
};

export class JobFailureAlerter {
  private readonly records = new Map<string, FailureRecord>();

  constructor(
    private readonly options: {
      webhookUrl?: string;
      threshold?: number;
      windowMs?: number;
      cooldownMs?: number;
    } = {},
  ) {}

  async recordFailure(jobName: string, err: unknown): Promise<void> {
    const now = Date.now();
    const windowMs = this.options.windowMs ?? WINDOW_MS;
    const threshold = this.options.threshold ?? THRESHOLD;
    const cooldownMs = this.options.cooldownMs ?? COOLDOWN_MS;

    let record = this.records.get(jobName);
    if (!record || now - record.windowStart > windowMs) {
      record = { count: 0, windowStart: now, lastAlertAt: 0 };
      this.records.set(jobName, record);
    }
    record.count += 1;

    if (record.count < threshold || now - record.lastAlertAt < cooldownMs) {
      return;
    }
    record.lastAlertAt = now;

    const message = err instanceof Error ? err.message : String(err);
    const payload = {
      text: `hushd-worker: job "${jobName}" failed ${record.count}x in ${Math.round(windowMs / 60000)}m — ${message}`,
      jobName,
      failures: record.count,
      windowMs,
      error: message,
    };

    if (!this.options.webhookUrl) {
      // eslint-disable-next-line no-console
      console.error("job_failure_alert", payload);
      return;
    }
    try {
      const res = await fetch(this.options.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        // eslint-disable-next-line no-console
        console.error("alert_webhook_failed", { status: res.status, jobName });
      }
    } catch (webhookErr) {
      // Alerting must never crash the worker.
      // eslint-disable-next-line no-console
      console.error("alert_webhook_error", webhookErr instanceof Error ? webhookErr.message : String(webhookErr));
    }
  }
}
