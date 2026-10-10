import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useNostr } from "../context/NostrContext";
import { PostCard } from "../components/PostCard";
import { Button } from "../components/dads/Button/Button";
import { publicKeyLabel } from "../lib/nostr";
import { classifyNotification } from "../lib/relays";

const labels = {
  reply: "返信しました",
  mention: "あなたに言及しました",
  reaction: "あなたの投稿にリアクションしました",
  repost: "あなたの投稿をリポストしました",
} as const;

export function NotificationsPage() {
  const { pubkey, profiles, notifications, loading, connect, loadNotifications } = useNostr();

  useEffect(() => {
    if (pubkey) void loadNotifications();
  }, [loadNotifications, pubkey]);

  return (
    <>
      <header className="flex items-center justify-between gap-3 border-b border-solid-gray-300 px-4 py-5 sm:px-6">
        <div>
          <h1 className="text-2xl font-bold">通知</h1>
          <p className="mt-1 text-sm text-solid-gray-600">
            あなた宛ての返信、言及、リアクションを表示します。
          </p>
        </div>
        {pubkey && (
          <Button
            disabled={loading}
            onClick={() => void loadNotifications()}
            size="sm"
            variant="outline"
          >
            更新
          </Button>
        )}
      </header>
      {!pubkey ? (
        <section className="px-6 py-12 text-center">
          <h2 className="text-lg font-bold">通知を見るには接続してください</h2>
          <p className="mt-2 text-sm text-solid-gray-600">
            NIP-07署名拡張を使って公開鍵を確認します。
          </p>
          <Button className="mt-4" onClick={() => void connect()} size="sm" variant="solid-fill">
            署名拡張に接続
          </Button>
        </section>
      ) : notifications.length ? (
        notifications.map((event) => {
          const profile = profiles[event.pubkey];
          const actor =
            profile?.display_name || profile?.name || publicKeyLabel(event.pubkey).slice(0, 16);
          return (
            <section className="border-b border-solid-gray-300" key={event.id}>
              <div className="px-4 pt-4 text-sm text-solid-gray-700 sm:px-6">
                <Link className="font-bold text-key-1000 underline" to={`/profile/${event.pubkey}`}>
                  {actor}
                </Link>
                さんが{labels[classifyNotification(event)]}。
              </div>
              <PostCard event={event} />
            </section>
          );
        })
      ) : (
        <p className="px-6 py-12 text-center text-solid-gray-700" role="status">
          {loading ? "通知を読み込み中です" : "新しい通知はありません。"}
        </p>
      )}
    </>
  );
}
