import { describe, expect, it } from "vitest";
import { envSchema, parseEnv } from "./index.js";

const valid = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
  REDIS_URL: "redis://localhost:6379",
  KAFKA_BROKERS: "localhost:19092",
  MEILI_HOST: "http://localhost:7700",
  MEILI_KEY: "key",
};

describe("env schema", () => {
  it("parses a valid environment", () => {
    const env = parseEnv(valid as NodeJS.ProcessEnv);
    expect(env.DATABASE_URL).toContain("postgresql://");
    expect(env.NODE_ENV).toBe("test");
  });

  it("rejects a missing required variable", () => {
    const { DATABASE_URL: _omit, ...rest } = valid;
    const result = envSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects a malformed url", () => {
    const result = envSchema.safeParse({ ...valid, DATABASE_URL: "not-a-url" });
    expect(result.success).toBe(false);
  });
});
