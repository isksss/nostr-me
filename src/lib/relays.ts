import type { Event } from "nostr-tools";

export const DEFAULT_RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.primal.net",
  "wss://yabu.me",
] as const;

export type RelaySettings = {
  read: string[];
  write: string[];
};

export function normalizeRelayUrl(value: string, allowLocal = false): string {
  const url = new URL(value.trim());
  const localHost = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "wss:" && !(allowLocal && localHost && url.protocol === "ws:")) {
    throw new Error("リレーURLにはwss://を指定してください。");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("認証情報・クエリ・フラグメントを含むURLはリレーに指定できません。");
  }
  return url.href.replace(/\/$/, "");
}

export function parseRelayList(event?: Event | null, allowLocal = false): RelaySettings {
  if (!event || event.kind !== 10002) {
    return { read: [...DEFAULT_RELAYS], write: [...DEFAULT_RELAYS] };
  }

  const read = new Set<string>();
  const write = new Set<string>();

  for (const [name, rawUrl, marker] of event.tags) {
    if (name !== "r" || !rawUrl) continue;

    try {
      const url = normalizeRelayUrl(rawUrl, allowLocal);
      if (marker === "read") read.add(url);
      else if (marker === "write") write.add(url);
      else if (!marker) {
        read.add(url);
        write.add(url);
      }
    } catch {
      // Ignore invalid relay entries from untrusted events.
    }
  }

  if (!read.size && !write.size) {
    return { read: [...DEFAULT_RELAYS], write: [...DEFAULT_RELAYS] };
  }

  return { read: [...read], write: [...write] };
}

export function makeRelayTags(settings: RelaySettings): string[][] {
  const tags = new Map<string, Set<"read" | "write">>();
  for (const url of settings.read) {
    tags.set(url, new Set([...(tags.get(url) ?? []), "read"]));
  }
  for (const url of settings.write) {
    tags.set(url, new Set([...(tags.get(url) ?? []), "write"]));
  }
  return [...tags].map(([url, markers]) =>
    markers.size === 2 ? ["r", url] : ["r", url, ...markers],
  );
}

export function mergeEvents(events: Event[]): Event[] {
  return [...new Map(events.map((event) => [event.id, event])).values()].sort(
    (left, right) => right.created_at - left.created_at,
  );
}

export function matchesSearch(event: Event, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return false;
  return (
    event.content.toLocaleLowerCase().includes(needle) ||
    event.pubkey.toLocaleLowerCase().includes(needle)
  );
}

export function classifyNotification(event: Event): "reply" | "mention" | "reaction" | "repost" {
  if (event.kind === 7) return "reaction";
  if (event.kind === 6) return "repost";
  const eventTags = event.tags.filter((tag) => tag[0] === "e");
  return eventTags.length && !eventTags.some((tag) => tag[3] === "mention") ? "reply" : "mention";
}
