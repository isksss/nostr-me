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
import {
  eventTemplate,
  readFollowing,
  readLatestEvent,
  readNotifications,
  readProfile,
  readProfiles,
  readTimeline,
  relayConnectionStatus,
  replyTags,
  repostTags,
  searchEvents,
  signAndPublish,
  subscribeTimeline,
  type Profile,
  type PublishResult,
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
      setEvents((current) => mergeEvents([event, ...current]));
      setConnectedCount(getConnectedCount(relays.read));
    });
    return () => {
      void subscription?.close();
    };
  }, [feedMode, following, pubkey, relays.read, updateProfiles]);

  const connect = useCallback(async () => {
    if (!window.nostr) {
      setNotice("NIP-07対応の署名拡張をインストールしてください。閲覧はこのまま利用できます。");
      return;
    }
    setLoading(true);
    setNotice("");
    try {
      const key = (await window.nostr.getPublicKey()).toLowerCase();
      if (!/^[0-9a-f]{64}$/i.test(key)) throw new Error("公開鍵の形式が正しくありません。");
      const [nip65Event, nextProfile, nextFollowing] = await Promise.all([
        readLatestEvent(DEFAULT_RELAYS.slice(), { authors: [key], kinds: [10002] }),
        readProfile(key, DEFAULT_RELAYS.slice()),
        readFollowing(key, DEFAULT_RELAYS.slice()),
      ]);
      const nextRelays = nip65Event
        ? parseRelayList(nip65Event, import.meta.env.DEV)
        : readSavedSettings();
      const nextMode: FeedMode = nextFollowing.length ? "following" : "global";
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
      setNotice("署名拡張に接続しました。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "接続できませんでした。");
    } finally {
      setLoading(false);
    }
  }, [updateProfiles]);

  const disconnect = useCallback(() => {
    const nextRelays = readSavedSettings();
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
  }, []);

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
      const result = await signAndPublish(pubkey, relays.write, eventTemplate(pubkey, 1, content));
      await loadTimeline(feedMode);
      setNotice(
        result.failed
          ? `投稿しました（${result.failed}件のリレーに送信できませんでした）。`
          : "投稿しました。",
      );
      return result;
    },
    [feedMode, loadTimeline, pubkey, relays.write],
  );

  const reply = useCallback(
    async (parent: Event, content: string) => {
      if (!pubkey) throw new Error("返信するには署名拡張へ接続してください。");
      const result = await signAndPublish(
        pubkey,
        relays.write,
        eventTemplate(pubkey, 1, content, replyTags(parent)),
      );
      setNotice(
        result.failed ? "返信しました。一部のリレーには届きませんでした。" : "返信しました。",
      );
      return result;
    },
    [pubkey, relays.write],
  );

  const react = useCallback(
    async (event: Event) => {
      if (!pubkey) throw new Error("リアクションするには署名拡張へ接続してください。");
      const result = await signAndPublish(
        pubkey,
        relays.write,
        eventTemplate(pubkey, 7, "+", [
          ["e", event.id],
          ["p", event.pubkey],
        ]),
      );
      setNotice(
        result.failed ? "いいねしました。一部のリレーには届きませんでした。" : "いいねしました。",
      );
      return result;
    },
    [pubkey, relays.write],
  );

  const repost = useCallback(
    async (event: Event) => {
      if (!pubkey) throw new Error("リポストするには署名拡張へ接続してください。");
      const result = await signAndPublish(
        pubkey,
        relays.write,
        eventTemplate(pubkey, 6, JSON.stringify(event), repostTags(event)),
      );
      setNotice(
        result.failed
          ? "リポストしました。一部のリレーには届きませんでした。"
          : "リポストしました。",
      );
      return result;
    },
    [pubkey, relays.write],
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
    [feedMode, pubkey, relays, updateProfiles],
  );

  const updateProfile = useCallback(
    async (next: Profile) => {
      if (!pubkey) throw new Error("プロフィールを編集するには署名拡張へ接続してください。");
      const result = await signAndPublish(
        pubkey,
        relays.write,
        eventTemplate(pubkey, 0, JSON.stringify(next)),
      );
      setProfile(next);
      setProfiles((current) => ({ ...current, [pubkey]: next }));
      setNotice("プロフィールを更新しました。");
      return result;
    },
    [pubkey, relays.write],
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
    [feedMode, following, pubkey, relays.write, updateProfiles],
  );

  const value = useMemo<NostrContextValue>(
    () => ({
      pubkey,
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
      saveRelays,
      setNotice,
    }),
    [
      connectedCount,
      connect,
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
      react,
      relays,
      reply,
      repost,
      saveRelays,
      search,
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
