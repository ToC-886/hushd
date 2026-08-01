import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import type { Response } from "express";
import type { RequestWithId } from "./request-id.middleware";
import { SentryService } from "./sentry.service";

/**
 * Single error contract for the whole API: clients always get
 * { statusCode, message, error } and 5xx internals never leak — they go to
 * Sentry and the logs instead.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  constructor(private readonly sentry: SentryService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const res = http.getResponse<Response>();
    const req = http.getRequest<RequestWithId>();
    const requestId = req.requestId;

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = exception instanceof HttpException ? normalizeBody(exception) : null;

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${req.method} ${req.path} -> ${status}${requestId ? ` [${requestId}]` : ""}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
      this.sentry.captureException(exception, {
        method: req.method,
        path: req.path,
        statusCode: status,
        requestId,
      });
    }

    res.status(status).json({
      ...(body ?? {
        statusCode: status,
        message: "internal_server_error",
        error: "Internal Server Error",
      }),
      // Correlation id lets support/ops tie a client-reported failure to the
      // exact log line and Sentry event.
      ...(requestId ? { requestId } : {}),
    });
  }
}

function normalizeBody(exception: HttpException): Record<string, unknown> {
  const response = exception.getResponse();
  if (typeof response === "string") {
    return { statusCode: exception.getStatus(), message: response };
  }
  return { statusCode: exception.getStatus(), ...(response as Record<string, unknown>) };
}
