import { Injectable } from "@nestjs/common";

type CounterKey = `${string}|${string}|${number}`;

/**
 * Minimal in-process Prometheus exporter. Counters reset on deploy, which is
 * fine — Prometheus scrapes and keeps the history.
 */
@Injectable()
export class MetricsService {
  private requestCounts = new Map<CounterKey, number>();
  private durationSums = new Map<CounterKey, number>();

  recordRequest(method: string, route: string, statusCode: number, durationMs: number) {
    const key: CounterKey = `${method}|${route}|${statusCode}`;
    this.requestCounts.set(key, (this.requestCounts.get(key) ?? 0) + 1);
    this.durationSums.set(key, (this.durationSums.get(key) ?? 0) + durationMs);
  }

  /** Prometheus text exposition format. */
  render(): string {
    const lines: string[] = [
      "# HELP http_requests_total Total HTTP requests by method, route and status.",
      "# TYPE http_requests_total counter",
    ];
    for (const [key, count] of this.requestCounts) {
      const [method, route, status] = key.split("|");
      lines.push(`http_requests_total{method="${method}",route="${route}",status="${status}"} ${count}`);
    }
    lines.push(
      "# HELP http_request_duration_ms_sum Total request duration in milliseconds.",
      "# TYPE http_request_duration_ms_sum counter",
    );
    for (const [key, sum] of this.durationSums) {
      const [method, route, status] = key.split("|");
      lines.push(
        `http_request_duration_ms_sum{method="${method}",route="${route}",status="${status}"} ${Math.round(sum)}`,
      );
    }
    return `${lines.join("\n")}\n`;
  }
}
