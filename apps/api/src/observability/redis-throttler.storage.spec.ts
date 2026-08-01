import type { ConfigService } from "@nestjs/config";

// Capture the mocked Redis instance created inside the storage constructor so
// we can drive eval responses and assert on call shape without a live Redis.
const evalMock = jest.fn();
const disconnectMock = jest.fn();

jest.mock("ioredis", () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      eval: evalMock,
      disconnect: disconnectMock,
    })),
  };
});

// eslint-disable-next-line import/first
import { RedisThrottlerStorage } from "./redis-throttler.storage";

describe("RedisThrottlerStorage", () => {
  let storage: RedisThrottlerStorage;

  beforeEach(() => {
    jest.clearAllMocks();
    const config = {
      get: jest.fn().mockReturnValue("redis://127.0.0.1:6379"),
    } as unknown as ConfigService;
    storage = new RedisThrottlerStorage(config);
  });

  it("maps the Lua result tuple into a ThrottlerStorageRecord", async () => {
    evalMock.mockResolvedValue([3, 12, 0, 0]);

    const record = await storage.increment("key-1", 10000, 5, 60000, "auth");

    expect(record).toEqual({
      totalHits: 3,
      timeToExpire: 12,
      isBlocked: false,
      timeToBlockExpire: 0,
    });
  });

  it("reports a blocked record when the Lua script flags isBlocked=1", async () => {
    evalMock.mockResolvedValue([6, 8, 1, 55]);

    const record = await storage.increment("key-1", 10000, 5, 60000, "auth");

    expect(record.isBlocked).toBe(true);
    expect(record.timeToBlockExpire).toBe(55);
  });

  it("scopes the Redis key by throttler name and passes a key expiry", async () => {
    evalMock.mockResolvedValue([1, 10, 0, 0]);

    await storage.increment("user:1", 10000, 5, 60000, "auth");

    const [script, numKeys, redisKey, , ttl, limit, blockDuration, keyExpiry] = evalMock.mock.calls[0];
    expect(typeof script).toBe("string");
    expect(numKeys).toBe(1);
    expect(redisKey).toBe("throttle:auth:user:1");
    expect(ttl).toBe("10000");
    expect(limit).toBe("5");
    expect(blockDuration).toBe("60000");
    // max(10000, 60000) / 1000 + 1 = 61
    expect(keyExpiry).toBe("61");
  });

  it("propagates Redis failures rather than silently allowing the request", async () => {
    evalMock.mockRejectedValue(new Error("connection refused"));

    await expect(storage.increment("k", 1000, 1, 1000, "auth")).rejects.toThrow(
      "connection refused",
    );
  });

  it("disconnects the Redis client on module destroy", async () => {
    await storage.onModuleDestroy();
    expect(disconnectMock).toHaveBeenCalled();
  });
});
