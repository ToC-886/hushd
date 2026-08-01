import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as Sentry from "@sentry/node";

/**
 * Thin wrapper so the rest of the app never touches Sentry directly — with no
 * DSN configured every call is a no-op and local dev stays clean.
 */
@Injectable()
export class SentryService implements OnModuleInit {
  private readonly logger = new Logger(SentryService.name);
  private enabled = false;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const dsn = this.config.get<string>("SENTRY_DSN");
    if (!dsn) return;
    Sentry.init({
      dsn,
      environment: this.config.get<string>("NODE_ENV") ?? "development",
      tracesSampleRate: Number(this.config.get("SENTRY_TRACES_SAMPLE_RATE") ?? 0),
    });
    this.enabled = true;
    this.logger.log("sentry_initialized");
  }

  captureException(error: unknown, context?: Record<string, unknown>) {
    if (!this.enabled) return;
    Sentry.withScope((scope) => {
      if (context) {
        for (const [key, value] of Object.entries(context)) {
          scope.setExtra(key, value);
        }
      }
      Sentry.captureException(error);
    });
  }

  isEnabled(): boolean {
    return this.enabled;
  }
}
