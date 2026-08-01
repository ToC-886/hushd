import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { ThrottlerStorage } from "@nestjs/throttler";
import type { ThrottlerStorageRecord } from "@nestjs/throttler/dist/throttler-storage-record.interface";
import IORedis from "ioredis";

/**
 * Redis-backed ThrottlerStorage so rate limits are shared across every API
 * instance. The default in-memory storage splits limits per process, which
 * quietly multiplies the effective limit by the replica count in production.
 *
 * All state for a (key, throttler) pair lives in two Redis keys and is mutated
 * by a single Lua script, so concurrent requests across instances stay atomic:
 *
 *   key  = sha1("throttle:<name>:<key>")        → hash { hits, expiresAt, blockExpiresAt }
 *
 * Sliding-window counter with an absolute block window, mirroring the
 * reference in-memory service. On any Redis failure the storage throws, which
 * surfaces as a 503 via the exception filter — failing closed rather than
 * silently dropping rate limiting.
 */
@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage, OnModuleDestroy {
  private readonly redis: IORedis;

  constructor(config: ConfigService) {
    const url = config.get<string>("REDIS_URL") ?? "redis://127.0.0.1:6379";
    this.redis = new IORedis(url, { maxRetriesPerRequest: 2, lazyConnect: false });
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const redisKey = `throttle:${throttlerName}:${key}`;
    const now = Date.now();

    const result = (await this.redis.eval(
      INCREMENT_SCRIPT,
      1,
      redisKey,
      String(now),
      String(ttl),
      String(limit),
      String(blockDuration),
      // expire the key a little past the longest it could be relevant
      String(Math.ceil(Math.max(ttl, blockDuration) / 1000) + 1),
    )) as [number, number, number, number];

    const [totalHits, timeToExpire, isBlocked, timeToBlockExpire] = result;
    return {
      totalHits,
      timeToExpire,
      isBlocked: isBlocked === 1,
      timeToBlockExpire,
    };
  }

  async onModuleDestroy(): Promise<void> {
    this.redis.disconnect();
  }
}

/**
 * Returns { totalHits, timeToExpireSec, isBlocked(0|1), timeToBlockExpireSec }.
 * All timestamps are ms epoch; the script works in ms and only converts to
 * whole seconds for the return values (matching the in-memory service).
 */
const INCREMENT_SCRIPT = `
local key       = KEYS[1]
local now       = tonumber(ARGV[1])
local ttl       = tonumber(ARGV[2])
local limit     = tonumber(ARGV[3])
local blockDur  = tonumber(ARGV[4])
local keyExpiry = tonumber(ARGV[5])

local hits          = tonumber(redis.call('HGET', key, 'hits') or '0')
local expiresAt     = tonumber(redis.call('HGET', key, 'expiresAt') or '0')
local blockExpiresAt= tonumber(redis.call('HGET', key, 'blockExpiresAt') or '0')

-- Window elapsed → reset the hit counter and start a new window.
if expiresAt <= now then
  hits = 0
  expiresAt = now + ttl
end

local isBlocked = 0
local timeToBlockExpire = math.ceil((blockExpiresAt - now) / 1000)

if blockExpiresAt > now then
  -- Inside an active block window: do not count further hits.
  isBlocked = 1
else
  if blockExpiresAt ~= 0 and blockExpiresAt <= now then
    -- Block window just elapsed → reset counter for a fresh window.
    hits = 0
    blockExpiresAt = 0
    expiresAt = now + ttl
  end
  hits = hits + 1
  if hits > limit then
    isBlocked = 1
    blockExpiresAt = now + blockDur
    timeToBlockExpire = math.ceil(blockDur / 1000)
  end
end

local timeToExpire = math.ceil((expiresAt - now) / 1000)
if timeToExpire < 0 then timeToExpire = 0 end
if isBlocked == 0 then timeToBlockExpire = 0 end
if timeToBlockExpire < 0 then timeToBlockExpire = 0 end

redis.call('HMSET', key, 'hits', hits, 'expiresAt', expiresAt, 'blockExpiresAt', blockExpiresAt)
redis.call('EXPIRE', key, keyExpiry)

return { hits, timeToExpire, isBlocked, timeToBlockExpire }
`;
