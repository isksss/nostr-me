import { describe, expect, it } from "vitest";
import type { Event } from "nostr-tools";
import { eventTemplate, parseProfile, publicKeyLabel, replyTags, repostTags } from "./nostr";

const parent: Event = {
  id: "a".repeat(64),
  created_at: 1,
  kind: 1,
  pubkey: "b".repeat(64),
  tags: [
    ["e", "c".repeat(64), "wss://relay.example", "root"],
    ["e", "a".repeat(64), "wss://relay.example", "reply"],
    ["p", "d".repeat(64)],
  ],
  content: "reply",
  sig: "e".repeat(128),
};

describe("Nostr event helpers", () => {
  it("builds NIP-10 root, reply, and participant tags", () => {
    expect(replyTags(parent)).toEqual([
      ["e", "c".repeat(64), "", "root"],
      ["e", "a".repeat(64), "", "reply"],
      ["p", "b".repeat(64)],
      ["p", "d".repeat(64)],
    ]);
  });

  it("tags reposts with the original event and author", () => {
    expect(repostTags(parent)).toEqual([
      ["e", "a".repeat(64), "", "mention"],
      ["p", "b".repeat(64)],
    ]);
  });

  it("builds a NIP-01 event template with validated public keys", () => {
    expect(eventTemplate("a".repeat(64), 1, "hello", [["t", "test"]])).toMatchObject({
      kind: 1,
      content: "hello",
      tags: [["t", "test"]],
    });
    expect(() => eventTemplate("not-a-pubkey", 1, "hello")).toThrow();
  });

  it("accepts only bounded string profile metadata", () => {
    expect(
      parseProfile(
        JSON.stringify({
          name: "Alice",
          about: "Hello",
          picture: { url: "https://example.com/picture.png" },
          nip05: "x".repeat(300),
        }),
      ),
    ).toEqual({
      name: "Alice",
      display_name: undefined,
      about: "Hello",
      picture: undefined,
      nip05: undefined,
      website: undefined,
    });
    expect(parseProfile(JSON.stringify({ nip05: "alice@example.com" })).nip05).toBe(
      "alice@example.com",
    );
    expect(parseProfile("[]")).toEqual({});
    expect(parseProfile("invalid json")).toEqual({});
  });

  it("encodes valid public keys for display", () => {
    expect(publicKeyLabel("a".repeat(64))).toMatch(/^npub1/);
    expect(publicKeyLabel("bad")).toBe("bad");
  });
});
