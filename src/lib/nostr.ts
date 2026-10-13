import {
  SimplePool,
  nip05,
  nip19,
  nip42,
  nip44,
  type Event,
  type EventTemplate,
  type Filter,
  type VerifiedEvent,
} from "nostr-tools";
import { finalizeEvent, generateSecretKey, getEventHash, verifyEvent } from "nostr-tools/pure";
import { mergeEvents } from "./relays";

const pool = new SimplePool({ enableReconnect: true });
pool.trackRelays = true;
pool.maxWaitForConnection = 4_000;

export type NostrSigner = {
  getPublicKey(): Promise<string>;
  signEvent(event: EventTemplate): Promise<VerifiedEvent>;
  nip04?: {
    encrypt(pubkey: string, plaintext: string): Promise<string>;
    decrypt(pubkey: string, ciphertext: string): Promise<string>;
  };
  nip44?: {
    encrypt(pubkey: string, plaintext: string): Promise<string>;
    decrypt(pubkey: string, ciphertext: string): Promise<string>;
  };
};

let authSigner: NostrSigner | undefined;
pool.automaticallyAuth = (relayURL) => {
  if (!authSigner) return null;
  return (event) => {
    const signer = authSigner;
    if (!signer) throw new Error("NIP-42認証には署名者への接続が必要です。");
    const challenge = event.tags.find((tag) => tag[0] === "challenge")?.[1];
    if (!challenge) throw new Error("リレーの認証チャレンジがありません。");
    return signer.signEvent(nip42.makeAuthEvent(relayURL, challenge)).then((signed) => {
      if (
        !verifyEvent(signed) ||
        signed.kind !== 22242 ||
        !signed.tags.some((tag) => tag[0] === "relay" && tag[1] === relayURL) ||
        !signed.tags.some((tag) => tag[0] === "challenge" && tag[1] === challenge)
      )
        throw new Error("正しいNIP-42認証イベントを確認できませんでした。");
      return signed;
    });
  };
};

export function setRelayAuthSigner(signer?: NostrSigner): void {
  authSigner = signer;
}

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

export type DirectMessage = {
  id: string;
  pubkey: string;
  created_at: number;
  content: string;
  peer: string;
};

export type ReactionSummary = {
  counts: Record<string, number>;
  reacted: boolean;
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

export async function verifyNip05(pubkey: string, identifier: string): Promise<boolean> {
  if (!/^[0-9a-f]{64}$/i.test(pubkey) || !nip05.isNip05(identifier)) return false;
  try {
    return await nip05.isValid(pubkey, identifier);
  } catch {
    return false;
  }
}

export function decodeNostrIdentifier(
  input: string,
):
  | { type: "profile"; pubkey: string }
  | { type: "event"; id: string; author?: string }
  | { type: "address"; pubkey: string; kind: number; identifier: string }
  | undefined {
  try {
    const decoded = nip19.decodeNostrURI(input.trim());
    if (decoded.type === "npub") return { type: "profile", pubkey: decoded.data };
    if (decoded.type === "nprofile") return { type: "profile", pubkey: decoded.data.pubkey };
    if (decoded.type === "note") return { type: "event", id: decoded.data };
    if (decoded.type === "nevent") {
      return { type: "event", id: decoded.data.id, author: decoded.data.author };
    }
    if (decoded.type === "naddr") {
      return {
        type: "address",
        pubkey: decoded.data.pubkey,
        kind: decoded.data.kind,
        identifier: decoded.data.identifier,
      };
    }
  } catch {
    return undefined;
  }
  return undefined;
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

function addressTag(event: Event): string | undefined {
  if (event.kind < 10_000 || event.kind >= 40_000) return undefined;
  const identifier = event.tags.find((tag) => tag[0] === "d")?.[1];
  return identifier === undefined ? undefined : `${event.kind}:${event.pubkey}:${identifier}`;
}

export function deletionTags(event: Event): string[][] {
  const address = addressTag(event);
  return [...(address ? [["a", address]] : []), ["e", event.id]];
}

export function verifyNip17Rumor(rumor: Event, seal: Event, recipient: string): boolean {
  if (
    rumor.kind !== 14 ||
    rumor.pubkey !== seal.pubkey ||
    !/^[0-9a-f]{64}$/i.test(rumor.pubkey) ||
    !/^[0-9a-f]{64}$/i.test(rumor.id) ||
    !Number.isSafeInteger(rumor.created_at) ||
    typeof rumor.content !== "string" ||
    !Array.isArray(rumor.tags) ||
    (rumor.pubkey !== recipient &&
      !rumor.tags.some((tag) => tag[0] === "p" && tag[1] === recipient))
  )
    return false;
  const unsigned = {
    pubkey: rumor.pubkey,
    created_at: rumor.created_at,
    kind: rumor.kind,
    tags: rumor.tags,
    content: rumor.content,
  };
  return getEventHash(unsigned) === rumor.id;
}

async function withoutDeletedEvents(events: Event[], relays: string[]): Promise<Event[]> {
  if (!events.length) return events;
  const addresses = events.map(addressTag).filter((value): value is string => Boolean(value));
  const [byId, byAddress] = await Promise.all([
    readEvents(relays, {
      kinds: [5],
      "#e": events.map((event) => event.id),
      limit: events.length * 2,
    }),
    addresses.length
      ? readEvents(relays, { kinds: [5], "#a": addresses, limit: addresses.length * 2 })
      : Promise.resolve([]),
  ]);
  const deletions = [...byId, ...byAddress];
  return events.filter((event) => {
    const address = addressTag(event);
    return !deletions.some(
      (deletion) =>
        deletion.pubkey === event.pubkey &&
        deletion.tags.some(
          (tag) =>
            (tag[0] === "e" && tag[1] === event.id) ||
            (address !== undefined && tag[0] === "a" && tag[1] === address),
        ),
    );
  });
}

export async function readVisibleEvents(relays: string[], filter: Filter): Promise<Event[]> {
  return withoutDeletedEvents(await readEvents(relays, filter), relays);
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
      if (!profiles[event.pubkey]) profiles[event.pubkey] = parseProfile(event.content);
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
    { kinds: [1, 5, 6, 30023], authors, since: Math.floor(Date.now() / 1_000) - 60 },
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
  const events = await readEvents(relays, {
    kinds: [1, 6, 30023],
    authors,
    until,
    limit,
  });
  return withoutDeletedEvents(events, relays);
}

export async function readLongForms(relays: string[], limit = 30): Promise<Event[]> {
  const events = await withoutDeletedEvents(
    await readEvents(relays, { kinds: [30023], limit }),
    relays,
  );
  const latest = new Map<string, Event>();
  for (const event of events) {
    const key = addressTag(event) ?? event.id;
    if (!latest.has(key) || latest.get(key)!.created_at < event.created_at) latest.set(key, event);
  }
  return [...latest.values()].sort((left, right) => right.created_at - left.created_at);
}

export async function readReplies(event: Event, relays: string[]): Promise<Event[]> {
  const root = event.tags.find((tag) => tag[0] === "e" && tag[3] === "root")?.[1] ?? event.id;
  const replies = await readEvents(relays, { kinds: [1], "#e": [root, event.id], limit: 100 });
  return withoutDeletedEvents(
    replies.filter((reply) => reply.id !== event.id && reply.tags.some((tag) => tag[0] === "e")),
    relays,
  );
}

export function summarizeReactions(reactions: Event[], pubkey?: string): ReactionSummary {
  return {
    counts: reactions.reduce<Record<string, number>>((counts, event) => {
      const reaction = event.content || "+";
      counts[reaction] = (counts[reaction] ?? 0) + 1;
      return counts;
    }, {}),
    reacted: Boolean(pubkey && reactions.some((event) => event.pubkey === pubkey)),
  };
}

export async function readReactionSummary(
  eventId: string,
  relays: string[],
  pubkey?: string,
): Promise<ReactionSummary> {
  const [reactions, ownReactions] = await Promise.all([
    readEvents(relays, { kinds: [7], "#e": [eventId], limit: 500 }),
    pubkey
      ? readEvents(relays, { kinds: [7], authors: [pubkey], "#e": [eventId], limit: 1 })
      : Promise.resolve([]),
  ]);
  return summarizeReactions(
    await withoutDeletedEvents(mergeEvents([...reactions, ...ownReactions]), relays),
    pubkey,
  );
}

export async function readNotifications(pubkey: string, relays: string[]): Promise<Event[]> {
  const events = await readEvents(relays, {
    kinds: [1, 6, 7],
    "#p": [pubkey],
    limit: 50,
  });
  return withoutDeletedEvents(
    events.filter((event) => event.pubkey !== pubkey),
    relays,
  );
}

export async function searchEvents(query: string, relays: string[]): Promise<Event[]> {
  const normalized = query.trim();
  if (!normalized) return [];
  try {
    const events = await readEvents(relays, {
      search: normalized,
      kinds: [0, 1, 30023],
      limit: 30,
    });
    return withoutDeletedEvents(events, relays);
  } catch {
    return [];
  }
}

export async function readDirectMessages(
  pubkey: string,
  relays: string[],
  signer: NostrSigner,
): Promise<DirectMessage[]> {
  const [received, sentLegacy] = await Promise.all([
    readEvents(relays, { kinds: [4, 1059], "#p": [pubkey], limit: 200 }),
    readEvents(relays, { kinds: [4], authors: [pubkey], limit: 100 }),
  ]);
  const events = mergeEvents([...received, ...sentLegacy]);
  const messages: DirectMessage[] = [];
  for (const event of events) {
    if (
      !(event.kind === 4 && event.pubkey === pubkey) &&
      !event.tags.some((tag) => tag[0] === "p" && tag[1] === pubkey)
    )
      continue;
    try {
      if (event.kind === 4 && signer.nip04) {
        const peer =
          event.pubkey === pubkey ? event.tags.find((tag) => tag[0] === "p")?.[1] : event.pubkey;
        if (!peer || !/^[0-9a-f]{64}$/i.test(peer)) continue;
        messages.push({
          id: event.id,
          pubkey: event.pubkey,
          created_at: event.created_at,
          content: await signer.nip04.decrypt(peer, event.content),
          peer,
        });
      }
      if (event.kind === 1059 && signer.nip44) {
        if (event.content.length > 100_000) continue;
        const seal = JSON.parse(await signer.nip44.decrypt(event.pubkey, event.content)) as Event;
        if (!verifyEvent(seal) || seal.kind !== 13 || seal.content.length > 100_000) continue;
        const rumor = JSON.parse(await signer.nip44.decrypt(seal.pubkey, seal.content)) as Event;
        if (!verifyNip17Rumor(rumor, seal, pubkey)) continue;
        const peer =
          rumor.pubkey === pubkey
            ? rumor.tags.find((tag) => tag[0] === "p" && tag[1] !== pubkey)?.[1]
            : rumor.pubkey;
        if (peer) {
          messages.push({
            id: event.id,
            pubkey: rumor.pubkey,
            created_at: rumor.created_at,
            content: rumor.content,
            peer,
          });
        }
      }
    } catch {
      // Ignore messages this signer cannot decrypt or malformed untrusted payloads.
    }
  }
  return messages.sort((left, right) => left.created_at - right.created_at);
}

export async function publishNip17Message(
  sender: string,
  recipient: string,
  content: string,
  relays: string[],
  signer: NostrSigner,
): Promise<PublishResult> {
  if (!signer.nip44) throw new Error("NIP-44暗号化に対応した署名拡張が必要です。");
  if (!/^[0-9a-f]{64}$/i.test(sender) || !/^[0-9a-f]{64}$/i.test(recipient)) {
    throw new Error("送信者または宛先の公開鍵が正しくありません。");
  }
  if (content.length > 10_000) throw new Error("メッセージは10,000文字以内にしてください。");
  const recipients = [...new Set([sender, recipient])];
  const acceptedEvents: Event[] = [];
  const now = Math.floor(Date.now() / 1_000);
  const rumorTags = [["p", recipient]];
  const rumor = {
    pubkey: sender,
    created_at: now,
    kind: 14,
    tags: rumorTags,
    content,
  };
  const rumorWithId = { ...rumor, id: getEventHash(rumor) };

  for (const target of recipients) {
    const sealTemplate: EventTemplate = {
      kind: 13,
      created_at: now - Math.floor(Math.random() * 172_800),
      tags: [],
      content: await signer.nip44.encrypt(target, JSON.stringify(rumorWithId)),
    };
    const seal = await signer.signEvent(sealTemplate);
    if (seal.pubkey !== sender || !verifyEvent(seal)) {
      throw new Error("署名拡張から正しいNIP-17封印を確認できませんでした。");
    }
    const ephemeral = generateSecretKey();
    const wrap = finalizeEvent(
      {
        kind: 1059,
        created_at: now - Math.floor(Math.random() * 172_800),
        tags: [["p", target]],
        content: nip44.encrypt(JSON.stringify(seal), nip44.getConversationKey(ephemeral, target)),
      },
      ephemeral,
    );
    acceptedEvents.push(wrap);
  }
  return publishEvents(relays, acceptedEvents);
}

export async function publishNip04Message(
  recipient: string,
  content: string,
  relays: string[],
  signer: NostrSigner,
  sender: string,
): Promise<PublishResult> {
  if (!signer.nip04) throw new Error("NIP-04暗号化に対応した署名拡張が必要です。");
  if (!/^[0-9a-f]{64}$/i.test(recipient)) throw new Error("宛先の公開鍵が正しくありません。");
  if (content.length > 10_000) throw new Error("メッセージは10,000文字以内にしてください。");
  const event = await signer.signEvent({
    kind: 4,
    created_at: Math.floor(Date.now() / 1_000),
    tags: [["p", recipient]],
    content: await signer.nip04.encrypt(recipient, content),
  });
  if (event.pubkey !== sender || !verifyEvent(event)) {
    throw new Error("署名拡張から正しいNIP-04イベントを確認できませんでした。");
  }
  return publishEvents(relays, [event]);
}

export async function deleteEvent(
  event: Event,
  pubkey: string,
  relays: string[],
  signer: NostrSigner,
): Promise<PublishResult> {
  if (event.pubkey !== pubkey) throw new Error("自分の投稿だけ削除できます。");
  const signed = await signer.signEvent({
    kind: 5,
    created_at: Math.floor(Date.now() / 1_000),
    tags: deletionTags(event),
    content: "",
  });
  if (signed.pubkey !== pubkey || !verifyEvent(signed)) {
    throw new Error("署名拡張から正しい削除イベントを確認できませんでした。");
  }
  return publishEvents(relays, [signed]);
}

export async function reportEvent(
  event: Event,
  category: string,
  pubkey: string,
  relays: string[],
  signer: NostrSigner,
): Promise<PublishResult> {
  if (
    !new Set(["nudity", "malware", "illegal", "spam", "impersonation", "profanity", "other"]).has(
      category,
    )
  ) {
    throw new Error("報告カテゴリが正しくありません。");
  }
  const signed = await signer.signEvent({
    kind: 1984,
    created_at: Math.floor(Date.now() / 1_000),
    tags: [
      ["e", event.id, category],
      ["p", event.pubkey, category],
    ],
    content: "",
  });
  if (signed.pubkey !== pubkey || !verifyEvent(signed)) {
    throw new Error("署名拡張から正しい報告イベントを確認できませんでした。");
  }
  return publishEvents(relays, [signed]);
}

export async function publishLongForm(
  pubkey: string,
  title: string,
  content: string,
  relays: string[],
  signer: NostrSigner,
): Promise<PublishResult> {
  if (!title.trim() || !content.trim()) throw new Error("タイトルと本文を入力してください。");
  if (title.length > 256 || content.length > 100_000) {
    throw new Error("記事はタイトル256文字・本文100,000文字以内にしてください。");
  }
  const signed = await signer.signEvent({
    kind: 30023,
    created_at: Math.floor(Date.now() / 1_000),
    tags: [
      ["d", `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`],
      ["title", title.trim().slice(0, 256)],
      ["published_at", String(Math.floor(Date.now() / 1_000))],
    ],
    content,
  });
  if (signed.pubkey !== pubkey || !verifyEvent(signed)) {
    throw new Error("署名拡張から正しい長文記事を確認できませんでした。");
  }
  return publishEvents(relays, [signed]);
}

export async function readLists(pubkey: string, relays: string[]): Promise<Event[]> {
  const events = await readEvents(relays, {
    authors: [pubkey],
    kinds: [10000, 10001, 10003, 10015, 30000, 30001, 30002, 30003],
    limit: 50,
  });
  return withoutDeletedEvents(events, relays);
}

export async function publishList(
  pubkey: string,
  title: string,
  members: string[],
  relays: string[],
  signer: NostrSigner,
): Promise<PublishResult> {
  const normalized = [...new Set(members.map((member) => member.trim().toLowerCase()))];
  if (!title.trim()) throw new Error("リスト名を入力してください。");
  if (normalized.length > 1_000) throw new Error("リストには1,000件まで登録できます。");
  if (normalized.some((member) => !/^[0-9a-f]{64}$/.test(member))) {
    throw new Error("リストには64桁の公開鍵を指定してください。");
  }
  const signed = await signer.signEvent({
    kind: 30000,
    created_at: Math.floor(Date.now() / 1_000),
    tags: [
      ["d", `nostr-me-${title.trim().toLocaleLowerCase().slice(0, 128)}`],
      ["title", title.trim().slice(0, 128)],
      ...normalized.map((key) => ["p", key]),
    ],
    content: "",
  });
  if (signed.pubkey !== pubkey || !verifyEvent(signed)) {
    throw new Error("署名拡張から正しいリストを確認できませんでした。");
  }
  return publishEvents(relays, [signed]);
}

export async function publishEvents(relays: string[], events: Event[]): Promise<PublishResult> {
  if (!relays.length) throw new Error("書き込み先リレーが設定されていません。");
  const results = await Promise.allSettled(events.flatMap((event) => pool.publish(relays, event)));
  const accepted = results.filter((result) => result.status === "fulfilled").length;
  const failed = results.length - accepted;
  if (!accepted) throw new Error("すべての書き込み先リレーで投稿に失敗しました。");
  return { accepted, failed };
}

export async function signAndPublish(
  pubkey: string,
  relays: string[],
  template: EventTemplate,
  signer: NostrSigner | undefined = window.nostr,
): Promise<PublishResult> {
  if (!signer) throw new Error("署名拡張またはNIP-46署名サーバーに接続してください。");
  if (!relays.length) throw new Error("書き込み先リレーが設定されていません。");

  const event = await signer.signEvent(template);
  if (event.pubkey !== pubkey || !verifyEvent(event)) {
    throw new Error("署名拡張から正しい署名イベントを確認できませんでした。");
  }
  return publishEvents(relays, [event]);
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
