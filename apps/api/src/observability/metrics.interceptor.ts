import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import type { Request, Response } from "express";
import { Observable, tap } from "rxjs";
import { MetricsService } from "./metrics.service";

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const start = Date.now();
    return next.handle().pipe(
      tap({
        next: () => this.record(req, http.getResponse<Response>(), start),
        error: () => this.record(req, http.getResponse<Response>(), start),
      }),
    );
  }

  private record(req: Request, res: Response, start: number) {
    if (req.path.startsWith("/metrics")) return;
    // route.path is the matched Nest route template (e.g. /v1/payouts/:id) when
    // available — falling back to req.path would explode label cardinality.
    const route = (req.route as { path?: string } | undefined)?.path ?? "unmatched";
    this.metrics.recordRequest(req.method, route, res.statusCode, Date.now() - start);
  }
}
