import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password.js";

describe("password hashing", () => {
  it("verifies a correct password", () => {
    const stored = hashPassword("s3cret-pw");
    expect(verifyPassword("s3cret-pw", stored)).toBe(true);
  });

  it("rejects an incorrect password", () => {
    const stored = hashPassword("s3cret-pw");
    expect(verifyPassword("wrong", stored)).toBe(false);
  });

  it("produces a unique salt per hash", () => {
    expect(hashPassword("same")).not.toBe(hashPassword("same"));
  });

  it("rejects a malformed stored value", () => {
    expect(verifyPassword("x", "not-a-valid-hash")).toBe(false);
  });
});
