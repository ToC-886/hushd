import { CanActivate, ExecutionContext, ForbiddenException, HttpException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request } from "express";
import { PrismaService } from "../prisma/prisma.service";

const DEFAULT_CACHE_MS = 60_000;
const UNAVAILABLE_FOR_LEGAL_REASONS = 451;
const EDGE_SECRET_HEADER = "x-geo-edge-secret";

/**
 * Region gating for jurisdictions where the platform cannot operate. The edge
 * (Cloudflare) injects the country header; the blocked set is cached for a
 * minute so the guard never sits on the request hot path.
 *
 * Only ACCESS-scoped blocks deny requests here; PAYOUTS-scoped blocks are
 * enforced at payout request/approval time by JurisdictionService.
 *
 * The country header is client-spoofable on any request that bypasses the
 * edge. When GEO_EDGE_SHARED_SECRET is configured, requests must prove they
 * transited the edge by presenting the shared secret; in production a missing
 * or wrong secret is rejected. When no secret is configured, production
 * traffic treats the header as untrusted (enforcement disabled, with a loud
 * startup warning) while non-production traffic keeps trusting it so local
 * geo-block testing stays possible.
 */
@Injectable()
export class GeoBlockGuard implements CanActivate {
  private blocked = new Set<string>();
  private lastRefresh = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const path = req.path ?? "";
    // Ops probes must stay reachable regardless of where they run.
    if (path.startsWith("/health") || path.startsWith("/metrics")) {
      return true;
    }
    const secret = this.config.get<string>("GEO_EDGE_SHARED_SECRET");
    if (secret) {
      const provided = req.headers[EDGE_SECRET_HEADER];
      const presented = Array.isArray(provided) ? provided[0] : provided;
      if (presented !== secret) {
        if (this.config.get("NODE_ENV") === "production") {
          throw new ForbiddenException("edge_auth_required");
        }
        // Outside production, treat the country header as untrusted rather
        // than rejecting local/dev traffic that never crosses an edge.
        return true;
      }
    } else if (this.config.get("NODE_ENV") === "production") {
      // No edge secret configured in production: the country header is
      // client-spoofable, so trusting it would create false compliance
      // assurance. Fail open but honestly — geo enforcement is disabled and
      // startup validation emits a loud warning until the secret is set.
      return true;
    }
    const country = countryCodeFrom(req);
    if (!country) {
      return true;
    }
    await this.refreshIfStale();
    if (this.blocked.has(country)) {
      throw new HttpException(
        {
          statusCode: UNAVAILABLE_FOR_LEGAL_REASONS,
          message: "region_unavailable_for_legal_reasons",
          error: "Unavailable For Legal Reasons",
        },
        UNAVAILABLE_FOR_LEGAL_REASONS,
      );
    }
    return true;
  }

  private async refreshIfStale() {
    const now = Date.now();
    const cacheMs = Number(this.config.get("GEO_BLOCK_CACHE_MS") ?? DEFAULT_CACHE_MS);
    if (now - this.lastRefresh < cacheMs) return;
    this.lastRefresh = now;
    try {
      const rows = await this.prisma.geoBlock.findMany({
        where: { active: true, scope: "ACCESS" },
        select: { countryCode: true },
      });
      this.blocked = new Set(rows.map((row) => row.countryCode.toUpperCase()));
    } catch {
      // Keep serving from the stale cache when the DB blips — a guard that
      // fails open on cache refresh errors is preferable to a global outage.
    }
  }
}

function countryCodeFrom(req: Request): string | null {
  const raw = req.headers["cf-ipcountry"] ?? req.headers["x-country-code"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || typeof value !== "string") return null;
  const code = value.trim().toUpperCase();
  // XX = unknown at the edge, empty/1-char values are junk.
  if (code.length !== 2 || code === "XX") return null;
  return code;
}
