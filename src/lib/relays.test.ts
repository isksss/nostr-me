import { describe, expect, it } from "vitest";
import type { Event } from "nostr-tools";
import {
  DEFAULT_RELAYS,
  classifyNotification,
  makeRelayTags,
  matchesSearch,
  mergeEvents,
  normalizeRelayUrl,
  parseRelayList,
} from "./relays";

const event = (id: string, created_at: number, kind = 1): Event => ({
  id,
  created_at,
  kind,
  pubkey: "a".repeat(64),
  tags: [],
  content: "note",
  sig: "b".repeat(128),
});

describe("relay settings", () => {
  it("uses the defaults, including the Japanese relay, when no NIP-65 event exists", () => {
    const settings = parseRelayList();
    expect(DEFAULT_RELAYS).toContain("wss://yabu.me");
    expect(settings.read).toEqual(DEFAULT_RELAYS);
    expect(settings.write).toEqual(DEFAULT_RELAYS);
    expect(settings.read).not.toBe(DEFAULT_RELAYS);
  });

  it("respects the read and write markers in NIP-65", () => {
    const settings = parseRelayList({
      ...event("c".repeat(64), 1, 10002),
      tags: [
        ["r", "wss://read.example", "read"],
        ["r", "wss://write.example", "write"],
      ],
    });
    expect(settings).toEqual({
      read: ["wss://read.example"],
      write: ["wss://write.example"],
    });
  });

  it("allows a read-only NIP-65 relay list", () => {
    expect(
      parseRelayList({
        ...event("c".repeat(64), 1, 10002),
        tags: [["r", "wss://read.example", "read"]],
      }),
    ).toEqual({ read: ["wss://read.example"], write: [] });
  });

  it("uses an unmarked relay for both reading and writing", () => {
    expect(
      parseRelayList({
        ...event("c".repeat(64), 1, 10002),
        tags: [
          ["r", "wss://relay.example/"],
          ["r", "wss://relay.example"],
        ],
      }),
    ).toEqual({ read: ["wss://relay.example"], write: ["wss://relay.example"] });
  });

  it("ignores invalid NIP-65 entries and falls back if all are invalid", () => {
    expect(
      parseRelayList({
        ...event("c".repeat(64), 1, 10002),
        tags: [["r", "https://relay.example", "read"]],
      }).read,
    ).toEqual(DEFAULT_RELAYS);
  });

  it("rejects insecure or credential-bearing public relay URLs", () => {
    expect(() => normalizeRelayUrl("ws://relay.example")).toThrow();
    expect(() => normalizeRelayUrl("wss://user:pass@relay.example")).toThrow();
    expect(() => normalizeRelayUrl("wss://relay.example/?token=x")).toThrow();
    expect(normalizeRelayUrl("ws://localhost:7777", true)).toBe("ws://localhost:7777");
  });

  it("writes one NIP-65 entry for a relay that is both read and write", () => {
    expect(
      makeRelayTags({
        read: ["wss://both.example", "wss://read.example"],
        write: ["wss://both.example", "wss://write.example"],
      }),
    ).toEqual([
      ["r", "wss://both.example"],
      ["r", "wss://read.example", "read"],
      ["r", "wss://write.example", "write"],
    ]);
  });
});

describe("event helpers", () => {
  it("matches a query against event content and author", () => {
    expect(matchesSearch(event("1", 1), "NOTE")).toBe(true);
    expect(matchesSearch({ ...event("2", 2), pubkey: "a".repeat(64) }, "AAAA")).toBe(true);
    expect(matchesSearch(event("3", 3), "   ")).toBe(false);
  });

  it("deduplicates by id and sorts newest first", () => {
    expect(
      mergeEvents([event("1", 1), event("2", 2), event("1", 1)]).map((item) => item.id),
    ).toEqual(["2", "1"]);
  });

  it("classifies Nostr notification event kinds", () => {
    expect(classifyNotification(event("1", 1, 7))).toBe("reaction");
    expect(classifyNotification(event("2", 2, 6))).toBe("repost");
    expect(classifyNotification({ ...event("3", 3), tags: [["e", "d".repeat(64)]] })).toBe("reply");
    expect(
      classifyNotification({ ...event("4", 4), tags: [["e", "d".repeat(64), "", "mention"]] }),
    ).toBe("mention");
    expect(classifyNotification(event("5", 5))).toBe("mention");
  });
});
