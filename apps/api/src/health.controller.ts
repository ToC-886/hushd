import { Controller, Get, Inject, ServiceUnavailableException } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import type IORedis from "ioredis";
import { Public } from "./auth/public.decorator";
import { PrismaService } from "./prisma/prisma.service";

@Controller("health")
@Public()
@SkipThrottle()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject("REDIS") private readonly redis: IORedis,
  ) {}

  /** Liveness: the process is up. */
  @Get()
  get() {
    return { ok: true, service: "hushd-api" };
  }

  /** Readiness: the process can actually serve — dependencies must respond. */
  @Get("ready")
  async ready() {
    const [database, redis] = await Promise.all([this.checkDatabase(), this.checkRedis()]);
    if (!database.ok || !redis.ok) {
      throw new ServiceUnavailableException({ ok: false, database, redis });
    }
    return { ok: true, database, redis };
  }

  private async checkDatabase() {
    const start = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { ok: true as const, latencyMs: Date.now() - start };
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async checkRedis() {
    const start = Date.now();
    try {
      await this.redis.ping();
      return { ok: true as const, latencyMs: Date.now() - start };
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
