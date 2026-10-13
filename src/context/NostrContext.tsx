import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Event } from "nostr-tools";
import { BunkerSigner, parseBunkerInput } from "nostr-tools/nip46";
import { generateSecretKey } from "nostr-tools/pure";
import {
  deleteEvent,
  eventTemplate,
  publishList,
  publishLongForm,
  publishNip04Message,
  publishNip17Message,
  readDirectMessages,
  readFollowing,
  readLatestEvent,
  readLists,
  readNotifications,
  readProfile,
  readProfiles,
  readReactionSummary,
  readReplies,
  readTimeline,
  relayConnectionStatus,
  replyTags,
  repostTags,
  reportEvent,
  searchEvents,
  setRelayAuthSigner,
  signAndPublish,
  subscribeTimeline,
  type DirectMessage,
  type NostrSigner,
  type Profile,
  type PublishResult,
  type ReactionSummary,
} from "../lib/nostr";
import {
  DEFAULT_RELAYS,
  makeRelayTags,
  matchesSearch,
  mergeEvents,
  normalizeRelayUrl,
  parseRelayList,
  type RelaySettings,
} from "../lib/relays";

type FeedMode = "global" | "following";

type NostrContextValue = {
  pubkey: string | null;
  signerKind: "nip07" | "nip46" | null;
  profile: Profile;
  profiles: Record<string, Profile>;
  relays: RelaySettings;
  following: string[];
  events: Event[];
  notifications: Event[];
  feedMode: FeedMode;
  loading: boolean;
  connectedCount: number;
  notice: string;
  connect: () => Promise<void>;
  connectBunker: (input: string) => Promise<void>;
  disconnect: () => void;
  loadTimeline: (mode?: FeedMode, until?: number, append?: boolean) => Promise<void>;
  loadNotifications: () => Promise<void>;
  search: (query: string) => Promise<Event[]>;
  publish: (content: string) => Promise<PublishResult>;
  reply: (parent: Event, content: string) => Promise<PublishResult>;
  react: (event: Event) => Promise<PublishResult>;
  repost: (event: Event) => Promise<PublishResult>;
  follow: (target: string, shouldFollow: boolean) => Promise<PublishResult>;
  updateProfile: (next: Profile) => Promise<PublishResult>;
  deletePost: (event: Event) => Promise<PublishResult>;
  reportPost: (event: Event, category: string) => Promise<PublishResult>;
  publishArticle: (title: string, content: string) => Promise<PublishResult>;
  savePeopleList: (title: string, members: string[]) => Promise<PublishResult>;
  loadLists: () => Promise<Event[]>;
  loadDirectMessages: () => Promise<DirectMessage[]>;
  sendDirectMessage: (
    recipient: string,
    content: string,
    legacy?: boolean,
  ) => Promise<PublishResult>;
  loadReplies: (event: Event) => Promise<Event[]>;
  reactionSummary: (eventId: string) => Promise<ReactionSummary>;
  saveRelays: (next: RelaySettings) => Promise<PublishResult | undefined>;
  setNotice: (message: string) => void;
};

const DEFAULT_SETTINGS: RelaySettings = {
  read: [...DEFAULT_RELAYS],
  write: [...DEFAULT_RELAYS],
};
const STORAGE_KEY = "nostr-me-relays";
const Context = createContext<NostrContextValue | null>(null);

function readSavedSettings(): RelaySettings {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (!value) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(value) as RelaySettings;
    return {
      read: [...new Set(parsed.read.map((url) => normalizeRelayUrl(url, import.meta.env.DEV)))],
      write: [...new Set(parsed.write.map((url) => normalizeRelayUrl(url, import.meta.env.DEV)))],
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function getConnectedCount(relays: string[]): number {
  const status = relayConnectionStatus();
  return relays.filter((relay) => status.get(relay)).length;
}

async function fetchFeed(
  relays: RelaySettings,
  mode: FeedMode,
  pubkey: string | null,
  following: string[],
  until?: number,
): Promise<Event[]> {
  const authors = mode === "following" && pubkey ? following : undefined;
  return readTimeline(relays.read, authors, until);
}

export function NostrProvider({ children }: { children: ReactNode }) {
  const [pubkey, setPubkey] = useState<string | null>(null);
  const [signer, setSigner] = useState<(NostrSigner & { close?: () => Promise<void> }) | null>(
    null,
  );
  const [signerKind, setSignerKind] = useState<"nip07" | "nip46" | null>(null);
  const [profile, setProfile] = useState<Profile>({});
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [relays, setRelays] = useState<RelaySettings>(readSavedSettings);
  const [following, setFollowing] = useState<string[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [notifications, setNotifications] = useState<Event[]>([]);
  const [feedMode, setFeedMode] = useState<FeedMode>("global");
  const [loading, setLoading] = useState(false);
  const [connectedCount, setConnectedCount] = useState(0);
  const [notice, setNotice] = useState("");

  const updateProfiles = useCallback(async (items: Event[], readRelays: string[]) => {
    const ids = items.flatMap((event) => {
      if (event.kind === 6) {
        try {
          const reposted: unknown = JSON.parse(event.content);
          const author =
            reposted &&
            typeof reposted === "object" &&
            "pubkey" in reposted &&
            typeof reposted.pubkey === "string" &&
            /^[0-9a-f]{64}$/i.test(reposted.pubkey)
              ? reposted.pubkey.toLowerCase()
              : undefined;
          return author ? [event.pubkey, author] : [event.pubkey];
        } catch {
          return [event.pubkey];
        }
      }
      return [event.pubkey];
    });
    const next = await readProfiles(ids, readRelays);
    setProfiles((current) => ({ ...current, ...next }));
  }, []);

  const loadTimeline = useCallback(
    async (mode: FeedMode = feedMode, until?: number, append = false) => {
      setLoading(true);
      setNotice("");
      try {
        const next = await fetchFeed(relays, mode, pubkey, following, until);
        setEvents((current) => (append ? mergeEvents([...current, ...next]) : next));
        setFeedMode(mode);
        await updateProfiles(next, relays.read);
        setConnectedCount(getConnectedCount(relays.read));
      } catch {
        setNotice("リレーに接続できませんでした。少し待ってから再読み込みしてください。");
      } finally {
        setLoading(false);
      }
    },
    [feedMode, following, pubkey, relays, updateProfiles],
  );

  useEffect(() => {
    void loadTimeline("global");
  }, []);

  useEffect(() => {
    const authors = feedMode === "following" && pubkey ? following : undefined;
    const subscription = subscribeTimeline(relays.read, authors, (event) => {
      if (event.kind === 5) {
        const deleted = new Set(event.tags.filter((tag) => tag[0] === "e").map((tag) => tag[1]));
        setEvents((current) =>
          current.filter((item) => item.pubkey !== event.pubkey || !deleted.has(item.id)),
        );
      } else {
        setEvents((current) => mergeEvents([event, ...current]));
      }
      setConnectedCount(getConnectedCount(relays.read));
    });
    return () => {
      void subscription?.close();
    };
  }, [feedMode, following, pubkey, relays.read, updateProfiles]);

  const connectWithSigner = useCallback(
    async (nextSigner: NostrSigner & { close?: () => Promise<void> }, kind: "nip07" | "nip46") => {
      setLoading(true);
      setNotice("");
      try {
        const key = (await nextSigner.getPublicKey()).toLowerCase();
        if (!/^[0-9a-f]{64}$/i.test(key)) throw new Error("公開鍵の形式が正しくありません。");
        setRelayAuthSigner(nextSigner);
        const [nip65Event, nextProfile, nextFollowing] = await Promise.all([
          readLatestEvent(DEFAULT_RELAYS.slice(), { authors: [key], kinds: [10002] }),
          readProfile(key, DEFAULT_RELAYS.slice()),
          readFollowing(key, DEFAULT_RELAYS.slice()),
        ]);
        const nextRelays = nip65Event
          ? parseRelayList(nip65Event, import.meta.env.DEV)
          : readSavedSettings();
        const nextMode: FeedMode = nextFollowing.length ? "following" : "global";
        setSigner(nextSigner);
        setSignerKind(kind);
        setPubkey(key);
        setProfile(nextProfile);
        setProfiles((current) => ({ ...current, [key]: nextProfile }));
        setFollowing(nextFollowing);
        setRelays(nextRelays);
        const nextEvents = await fetchFeed(nextRelays, nextMode, key, nextFollowing);
        setEvents(nextEvents);
        setFeedMode(nextMode);
        await updateProfiles(nextEvents, nextRelays.read);
        setConnectedCount(getConnectedCount(nextRelays.read));
        setNotice(
          kind === "nip07" ? "署名拡張に接続しました。" : "NIP-46署名サーバーに接続しました。",
        );
      } catch (error) {
        setRelayAuthSigner(undefined);
        await nextSigner.close?.();
        setNotice(error instanceof Error ? error.message : "接続できませんでした。");
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [updateProfiles],
  );

  const connect = useCallback(async () => {
    if (!window.nostr) {
      setNotice(
        "NIP-07対応の署名拡張をインストールしてください。NIP-46接続情報でもログインできます。閲覧はこのまま利用できます。",
      );
      return;
    }
    try {
      await connectWithSigner(window.nostr, "nip07");
    } catch {
      // The connection error is already shown in the app notice.
    }
  }, [connectWithSigner]);

  const connectBunker = useCallback(
    async (input: string) => {
      if (input.length > 2_048) throw new Error("NIP-46接続情報は2,048文字以内にしてください。");
      const pointer = await parseBunkerInput(input.trim());
      if (!pointer) throw new Error("bunker:// URLまたはNIP-05接続先を確認してください。");
      if (!/^[0-9a-f]{64}$/i.test(pointer.pubkey))
        throw new Error("NIP-46公開鍵の形式が正しくありません。");
      pointer.relays = [...new Set(pointer.relays.map((url) => normalizeRelayUrl(url)))];
      if (!pointer.relays.length) throw new Error("NIP-46接続先リレーがありません。");
      if (pointer.relays.length > 8) throw new Error("NIP-46リレーは8局まで指定できます。");
      const bunker = BunkerSigner.fromBunker(generateSecretKey(), pointer);
      try {
        await bunker.connect({ name: "nostr.me", url: window.location.origin });
        await connectWithSigner(
          {
            getPublicKey: () => bunker.getPublicKey(),
            signEvent: (event) => bunker.signEvent(event),
            nip04: {
              encrypt: (pubkey, plaintext) => bunker.nip04Encrypt(pubkey, plaintext),
              decrypt: (pubkey, ciphertext) => bunker.nip04Decrypt(pubkey, ciphertext),
            },
            nip44: {
              encrypt: (pubkey, plaintext) => bunker.nip44Encrypt(pubkey, plaintext),
              decrypt: (pubkey, ciphertext) => bunker.nip44Decrypt(pubkey, ciphertext),
            },
            close: () => bunker.close(),
          },
          "nip46",
        );
      } catch (error) {
        await bunker.close();
        throw error;
      }
    },
    [connectWithSigner],
  );

  const disconnect = useCallback(() => {
    const nextRelays = readSavedSettings();
    void signer?.close?.();
    setRelayAuthSigner(undefined);
    setSigner(null);
    setSignerKind(null);
    setPubkey(null);
    setProfile({});
    setFollowing([]);
    setNotifications([]);
    setRelays(nextRelays);
    setFeedMode("global");
    setNotice("ログアウトしました。");
    setLoading(true);
    void fetchFeed(nextRelays, "global", null, [])
      .then(setEvents)
      .catch(() => setNotice("リレーに接続できませんでした。"))
      .finally(() => setLoading(false));
  }, [signer]);

  const loadNotifications = useCallback(async () => {
    if (!pubkey) return;
    setLoading(true);
    try {
      const next = await readNotifications(pubkey, relays.read);
      setNotifications(next);
      await updateProfiles(next, relays.read);
    } catch {
      setNotice("通知を取得できませんでした。");
    } finally {
      setLoading(false);
    }
  }, [pubkey, relays.read, updateProfiles]);

  const search = useCallback(
    async (query: string) => {
      const remote = await searchEvents(query, relays.read);
      const local = events.filter((event) => matchesSearch(event, query));
      const results = mergeEvents([...remote, ...local]);
      await updateProfiles(results, relays.read);
      return results;
    },
    [events, relays.read, updateProfiles],
  );

  const publish = useCallback(
    async (content: string) => {
      if (!pubkey) throw new Error("投稿するには署名拡張へ接続してください。");
      const result = await signAndPublish(
        pubkey,
        relays.write,
        eventTemplate(pubkey, 1, content),
        signer ?? undefined,
      );
      await loadTimeline(feedMode);
      setNotice(
        result.failed
          ? `投稿しました（${result.failed}件のリレーに送信できませんでした）。`
          : "投稿しました。",
      );
      return result;
    },
    [feedMode, loadTimeline, pubkey, relays.write, signer],
  );

  const reply = useCallback(
    async (parent: Event, content: string) => {
      if (!pubkey) throw new Error("返信するには署名拡張へ接続してください。");
      const result = await signAndPublish(
        pubkey,
        relays.write,
        eventTemplate(pubkey, 1, content, replyTags(parent)),
        signer ?? undefined,
      );
      setNotice(
        result.failed ? "返信しました。一部のリレーには届きませんでした。" : "返信しました。",
      );
      return result;
    },
    [pubkey, relays.write, signer],
  );

  const react = useCallback(
    async (event: Event) => {
      if (!pubkey) throw new Error("リアクションするには署名拡張へ接続してください。");
      const result = await signAndPublish(
        pubkey,
        relays.write,
        eventTemplate(pubkey, 7, "👍", [
          ["e", event.id],
          ["p", event.pubkey],
        ]),
        signer ?? undefined,
      );
      setNotice(
        result.failed
          ? "リアクションしました。一部のリレーには届きませんでした。"
          : "リアクションしました。",
      );
      return result;
    },
    [pubkey, relays.write, signer],
  );

  const repost = useCallback(
    async (event: Event) => {
      if (!pubkey) throw new Error("リポストするには署名拡張へ接続してください。");
      const result = await signAndPublish(
        pubkey,
        relays.write,
        eventTemplate(pubkey, 6, JSON.stringify(event), repostTags(event)),
        signer ?? undefined,
      );
      setNotice(
        result.failed
          ? "リポストしました。一部のリレーには届きませんでした。"
          : "リポストしました。",
      );
      return result;
    },
    [pubkey, relays.write, signer],
  );

  const follow = useCallback(
    async (target: string, shouldFollow: boolean) => {
      if (!pubkey) throw new Error("フォローを管理するには署名拡張へ接続してください。");
      if (!/^[0-9a-f]{64}$/i.test(target)) throw new Error("公開鍵の形式が正しくありません。");
      const normalizedTarget = target.toLowerCase();
      const contactsEvent = await readLatestEvent(relays.read, { authors: [pubkey], kinds: [3] });
      const currentTags = contactsEvent?.tags ?? [];
      const otherTags = currentTags.filter((tag) => tag[0] !== "p");
      const contacts = new Map(
        currentTags
          .filter((tag) => tag[0] === "p" && tag[1])
          .map((tag) => [tag[1].toLowerCase(), tag]),
      );
      if (shouldFollow) contacts.set(normalizedTarget, ["p", normalizedTarget]);
      else contacts.delete(normalizedTarget);
      const result = await signAndPublish(
        pubkey,
        relays.write,
        eventTemplate(pubkey, 3, contactsEvent?.content ?? "{}", [
          ...otherTags,
          ...contacts.values(),
        ]),
        signer ?? undefined,
      );
      const next = [...contacts.keys()];
      setFollowing(next);
      if (feedMode === "following") {
        try {
          const nextEvents = await fetchFeed(relays, "following", pubkey, next);
          setEvents(nextEvents);
          await updateProfiles(nextEvents, relays.read);
        } catch {
          setNotice("フォロー設定は更新しましたが、タイムラインを読み込めませんでした。");
          return result;
        }
      }
      setNotice(
        result.failed
          ? "フォロー設定を更新しました。一部のリレーには届きませんでした。"
          : shouldFollow
            ? "フォローしました。"
            : "フォローを解除しました。",
      );
      return result;
    },
    [feedMode, pubkey, relays, signer, updateProfiles],
  );

  const updateProfile = useCallback(
    async (next: Profile) => {
      if (!pubkey) throw new Error("プロフィールを編集するには署名拡張へ接続してください。");
      const result = await signAndPublish(
        pubkey,
        relays.write,
        eventTemplate(pubkey, 0, JSON.stringify(next)),
        signer ?? undefined,
      );
      setProfile(next);
      setProfiles((current) => ({ ...current, [pubkey]: next }));
      setNotice("プロフィールを更新しました。");
      return result;
    },
    [pubkey, relays.write, signer],
  );

  const deletePost = useCallback(
    async (event: Event) => {
      if (!pubkey || !signer) throw new Error("削除するには署名者へ接続してください。");
      const result = await deleteEvent(event, pubkey, relays.write, signer);
      setEvents((current) => current.filter((item) => item.id !== event.id));
      setNotice("削除リクエストをリレーへ送信しました。リレー上の削除は保証されません。");
      return result;
    },
    [pubkey, relays.write, signer],
  );

  const reportPost = useCallback(
    async (event: Event, category: string) => {
      if (!pubkey || !signer) throw new Error("報告するには署名者へ接続してください。");
      return reportEvent(event, category, pubkey, relays.write, signer);
    },
    [pubkey, relays.write, signer],
  );

  const publishArticle = useCallback(
    async (title: string, content: string) => {
      if (!pubkey || !signer) throw new Error("記事を公開するには署名者へ接続してください。");
      const result = await publishLongForm(pubkey, title, content, relays.write, signer);
      setNotice(
        result.failed
          ? "記事を公開しました。一部のリレーに届きませんでした。"
          : "記事を公開しました。",
      );
      return result;
    },
    [pubkey, relays.write, signer],
  );

  const savePeopleList = useCallback(
    async (title: string, members: string[]) => {
      if (!pubkey || !signer) throw new Error("リストを公開するには署名者へ接続してください。");
      const result = await publishList(pubkey, title, members, relays.write, signer);
      setNotice("公開リストを保存しました。");
      return result;
    },
    [pubkey, relays.write, signer],
  );

  const loadLists = useCallback(async () => {
    if (!pubkey) return [];
    return readLists(pubkey, relays.read);
  }, [pubkey, relays.read]);

  const loadDirectMessages = useCallback(async () => {
    if (!pubkey || !signer) throw new Error("DMを見るには署名者へ接続してください。");
    return readDirectMessages(pubkey, relays.read, signer);
  }, [pubkey, relays.read, signer]);

  const sendDirectMessage = useCallback(
    async (recipient: string, content: string, legacy = false) => {
      if (!pubkey || !signer) throw new Error("DMを送るには署名者へ接続してください。");
      return legacy
        ? publishNip04Message(recipient, content, relays.write, signer, pubkey)
        : publishNip17Message(pubkey, recipient, content, relays.write, signer);
    },
    [pubkey, relays.write, signer],
  );

  const loadReplies = useCallback((event: Event) => readReplies(event, relays.read), [relays.read]);

  const reactionSummary = useCallback(
    (eventId: string) => readReactionSummary(eventId, relays.read, pubkey ?? undefined),
    [pubkey, relays.read],
  );

  const saveRelays = useCallback(
    async (next: RelaySettings) => {
      const normalized: RelaySettings = {
        read: [...new Set(next.read.map((url) => normalizeRelayUrl(url, import.meta.env.DEV)))],
        write: [...new Set(next.write.map((url) => normalizeRelayUrl(url, import.meta.env.DEV)))],
      };
      if (!normalized.read.length && !normalized.write.length) {
        throw new Error("読み込み用または書き込み用リレーを1件以上設定してください。");
      }
      let result: PublishResult | undefined;
      if (pubkey) {
        const destinations = [...new Set([...relays.write, ...normalized.write])];
        result = await signAndPublish(
          pubkey,
          destinations,
          eventTemplate(pubkey, 10002, "", makeRelayTags(normalized)),
          signer ?? undefined,
        );
      } else {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
      }
      setRelays(normalized);
      setLoading(true);
      let refreshFailed = false;
      try {
        const nextEvents = await fetchFeed(normalized, feedMode, pubkey, following);
        setEvents(nextEvents);
        await updateProfiles(nextEvents, normalized.read);
        setConnectedCount(getConnectedCount(normalized.read));
      } catch {
        refreshFailed = true;
      } finally {
        setLoading(false);
      }
      setNotice(
        refreshFailed
          ? "リレー設定は保存しましたが、タイムラインを読み込めませんでした。"
          : result?.failed
            ? "リレー設定を更新しました。一部のリレーには届きませんでした。"
            : "リレー設定を更新しました。",
      );
      return result;
    },
    [feedMode, following, pubkey, relays.write, signer, updateProfiles],
  );

  const value = useMemo<NostrContextValue>(
    () => ({
      pubkey,
      signerKind,
      profile,
      profiles,
      relays,
      following,
      events,
      notifications,
      feedMode,
      loading,
      connectedCount,
      notice,
      connect,
      connectBunker,
      disconnect,
      loadTimeline,
      loadNotifications,
      search,
      publish,
      reply,
      react,
      repost,
      follow,
      updateProfile,
      deletePost,
      reportPost,
      publishArticle,
      savePeopleList,
      loadLists,
      loadDirectMessages,
      sendDirectMessage,
      loadReplies,
      reactionSummary,
      saveRelays,
      setNotice,
    }),
    [
      connectedCount,
      connect,
      connectBunker,
      deletePost,
      disconnect,
      events,
      feedMode,
      follow,
      following,
      loadNotifications,
      loadTimeline,
      loading,
      notice,
      notifications,
      profile,
      profiles,
      pubkey,
      publish,
      publishArticle,
      react,
      reactionSummary,
      reportPost,
      relays,
      reply,
      repost,
      saveRelays,
      savePeopleList,
      search,
      sendDirectMessage,
      loadDirectMessages,
      loadLists,
      loadReplies,
      signerKind,
      updateProfile,
    ],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useNostr(): NostrContextValue {
  const context = useContext(Context);
  if (!context) throw new Error("useNostr must be used inside NostrProvider");
  return context;
}
