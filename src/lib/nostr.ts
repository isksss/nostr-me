import { SimplePool, nip19, type Event, type EventTemplate, type Filter } from "nostr-tools";
import { verifyEvent } from "nostr-tools/pure";
import { mergeEvents } from "./relays";

const pool = new SimplePool({ enableReconnect: true });
pool.trackRelays = true;
pool.maxWaitForConnection = 4_000;

export type Profile = {
  name?: string;
  display_name?: string;
  about?: string;
  picture?: string;
  nip05?: string;
  website?: string;
};

export type PublishResult = {
  accepted: number;
  failed: number;
};

export function parseProfile(content: string): Profile {
  try {
    const value: unknown = JSON.parse(content);
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const raw = value as Record<string, unknown>;
    const field = (name: keyof Profile, limit: number) => {
      const item = raw[name];
      return typeof item === "string" && item.length <= limit ? item : undefined;
    };
    return {
      name: field("name", 128),
      display_name: field("display_name", 128),
      about: field("about", 5_000),
      picture: field("picture", 2_048),
      nip05: field("nip05", 256),
      website: field("website", 2_048),
    };
  } catch {
    return {};
  }
}

export function relayConnectionStatus(): Map<string, boolean> {
  return pool.listConnectionStatus();
}

export async function readEvents(relays: string[], filter: Filter): Promise<Event[]> {
  if (!relays.length) return [];
  const events = await pool.querySync(relays, filter, { maxWait: 4_000 });
  return mergeEvents(events.filter(verifyEvent));
}

export async function readLatestEvent(
  relays: string[],
  filter: Filter,
): Promise<Event | undefined> {
  return (await readEvents(relays, { ...filter, limit: 1 }))[0];
}

export async function readProfile(pubkey: string, relays: string[]): Promise<Profile> {
  try {
    const event = await readLatestEvent(relays, { authors: [pubkey], kinds: [0] });
    return event ? parseProfile(event.content) : {};
  } catch {
    return {};
  }
}

export async function readProfiles(
  pubkeys: string[],
  relays: string[],
): Promise<Record<string, Profile>> {
  if (!pubkeys.length || !relays.length) return {};
  const unique = [...new Set(pubkeys)].slice(0, 100);
  try {
    const events = await readEvents(relays, { authors: unique, kinds: [0], limit: unique.length });
    const profiles: Record<string, Profile> = {};
    for (const event of events) {
      if (!profiles[event.pubkey]) {
        profiles[event.pubkey] = parseProfile(event.content);
      }
    }
    return profiles;
  } catch {
    return {};
  }
}

export async function readFollowing(pubkey: string, relays: string[]): Promise<string[]> {
  try {
    const event = await readLatestEvent(relays, { authors: [pubkey], kinds: [3] });
    return event
      ? [
          ...new Set(
            event.tags
              .filter(
                (tag) =>
                  tag[0] === "p" && typeof tag[1] === "string" && /^[0-9a-f]{64}$/i.test(tag[1]),
              )
              .map((tag) => tag[1].toLowerCase()),
          ),
        ]
      : [];
  } catch {
    return [];
  }
}

export function subscribeTimeline(
  relays: string[],
  authors: string[] | undefined,
  onEvent: (event: Event) => void,
): ReturnType<typeof pool.subscribeMany> | undefined {
  if (!relays.length || (authors && !authors.length)) return undefined;
  return pool.subscribeMany(
    relays,
    { kinds: [1, 6], authors, since: Math.floor(Date.now() / 1_000) - 60 },
    { onevent: (event) => verifyEvent(event) && onEvent(event), maxWait: 4_000 },
  );
}

export async function readTimeline(
  relays: string[],
  authors?: string[],
  until?: number,
  limit = 30,
): Promise<Event[]> {
  if (authors && !authors.length) return [];
  return readEvents(relays, {
    kinds: [1, 6],
    authors,
    until,
    limit,
  });
}

export async function readNotifications(pubkey: string, relays: string[]): Promise<Event[]> {
  const events = await readEvents(relays, {
    kinds: [1, 6, 7],
    "#p": [pubkey],
    limit: 50,
  });
  return events.filter((event) => event.pubkey !== pubkey);
}

export async function searchEvents(query: string, relays: string[]): Promise<Event[]> {
  const normalized = query.trim();
  if (!normalized) return [];
  try {
    return await readEvents(relays, {
      search: normalized,
      kinds: [0, 1],
      limit: 30,
    });
  } catch {
    return [];
  }
}

export async function signAndPublish(
  pubkey: string,
  relays: string[],
  template: EventTemplate,
): Promise<PublishResult> {
  if (!window.nostr) throw new Error("NIP-07対応の署名拡張が見つかりません。");
  if (!relays.length) throw new Error("書き込み先リレーが設定されていません。");

  const event = await window.nostr.signEvent(template);
  if (event.pubkey !== pubkey || !verifyEvent(event)) {
    throw new Error("署名拡張から正しい署名イベントを確認できませんでした。");
  }

  const results = await Promise.allSettled(pool.publish(relays, event));
  const accepted = results.filter((result) => result.status === "fulfilled").length;
  const failed = results.length - accepted;
  if (!accepted) throw new Error("すべての書き込み先リレーで投稿に失敗しました。");
  return { accepted, failed };
}

export function eventTemplate(
  pubkey: string,
  kind: number,
  content: string,
  tags: string[][] = [],
): EventTemplate {
  if (!/^[0-9a-f]{64}$/i.test(pubkey)) throw new Error("公開鍵の形式が正しくありません。");
  return { kind, created_at: Math.floor(Date.now() / 1_000), content, tags };
}

export function replyTags(parent: Event): string[][] {
  const eventTags = parent.tags.filter((tag) => tag[0] === "e" && tag[1]);
  const root = eventTags.find((tag) => tag[3] === "root")?.[1] ?? eventTags[0]?.[1] ?? parent.id;
  const tags =
    root === parent.id
      ? [["e", parent.id, "", "root"]]
      : [
          ["e", root, "", "root"],
          ["e", parent.id, "", "reply"],
        ];
  const participants = new Set([
    parent.pubkey,
    ...parent.tags.filter((tag) => tag[0] === "p" && tag[1]).map((tag) => tag[1]),
  ]);
  return [...tags, ...[...participants].map((participant) => ["p", participant])];
}

export function repostTags(event: Event): string[][] {
  return [
    ["e", event.id, "", "mention"],
    ["p", event.pubkey],
  ];
}

export function publicKeyLabel(pubkey: string): string {
  try {
    return nip19.npubEncode(pubkey);
  } catch {
    return pubkey;
  }
}
