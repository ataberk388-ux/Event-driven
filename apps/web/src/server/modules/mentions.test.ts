import { describe, expect, it } from "vitest";
import { matchMentions, type MentionMember } from "./mentions.js";

const members: MentionMember[] = [
  { id: "u1", name: "Alice Smith", email: "alice@acme.co" },
  { id: "u2", name: "Bob Jones", email: "bob@acme.co" },
  { id: "u3", name: null, email: "carol@acme.co" },
];

describe("matchMentions", () => {
  it("matches by first name (case-insensitive)", () => {
    expect(matchMentions("hey @alice look", members)).toEqual(["u1"]);
    expect(matchMentions("@BOB ping", members)).toEqual(["u2"]);
  });

  it("matches by email local-part (works without a name)", () => {
    expect(matchMentions("cc @carol", members)).toEqual(["u3"]);
  });

  it("matches multiple distinct members", () => {
    expect(matchMentions("@alice @bob review pls", members).sort()).toEqual(["u1", "u2"]);
  });

  it("excludes the author and returns [] with no mentions", () => {
    expect(matchMentions("@alice hi", members, "u1")).toEqual([]);
    expect(matchMentions("no mentions here", members)).toEqual([]);
  });

  it("ignores unknown handles and de-dupes", () => {
    expect(matchMentions("@nobody @alice @alice", members)).toEqual(["u1"]);
  });
});
