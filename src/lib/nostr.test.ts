import { describe, expect, it } from "vitest";
import { nip19, type Event } from "nostr-tools";
import { getEventHash } from "nostr-tools/pure";
import {
  decodeNostrIdentifier,
  deletionTags,
  eventTemplate,
  parseProfile,
  publicKeyLabel,
  replyTags,
  repostTags,
  verifyNip17Rumor,
} from "./nostr";

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

  it("builds NIP-09 deletion references for addressable events", () => {
    const article = { ...parent, kind: 30023, tags: [["d", "intro"]] };
    expect(deletionTags(article)).toEqual([
      ["a", `30023:${article.pubkey}:intro`],
      ["e", article.id],
    ]);
    expect(deletionTags(parent)).toEqual([["e", parent.id]]);
  });

  it("decodes NIP-19 profile and event identifiers without accepting secret keys", () => {
    const key = "a".repeat(64);
    const event = "b".repeat(64);
    expect(decodeNostrIdentifier(nip19.npubEncode(key))).toEqual({ type: "profile", pubkey: key });
    expect(decodeNostrIdentifier(nip19.nprofileEncode({ pubkey: key }))).toEqual({
      type: "profile",
      pubkey: key,
    });
    expect(decodeNostrIdentifier(nip19.noteEncode(event))).toEqual({ type: "event", id: event });
    expect(
      decodeNostrIdentifier(nip19.naddrEncode({ identifier: "article", pubkey: key, kind: 30023 })),
    ).toEqual({
      type: "address",
      pubkey: key,
      kind: 30023,
      identifier: "article",
    });
    expect(decodeNostrIdentifier(nip19.nsecEncode(new Uint8Array(32)))).toBeUndefined();
  });

  it("validates NIP-17 rumor hashes and recipient tags", () => {
    const rumorData = {
      pubkey: "a".repeat(64),
      created_at: 10,
      kind: 14,
      tags: [["p", "b".repeat(64)]],
      content: "secret",
    };
    const rumor: Event = {
      ...rumorData,
      id: getEventHash(rumorData),
      sig: "c".repeat(128),
    };
    const seal = { ...parent, kind: 13, pubkey: rumor.pubkey };
    expect(verifyNip17Rumor(rumor, seal, "b".repeat(64))).toBe(true);
    expect(verifyNip17Rumor({ ...rumor, content: "forged" }, seal, "b".repeat(64))).toBe(false);
    expect(verifyNip17Rumor(rumor, seal, "d".repeat(64))).toBe(false);
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
