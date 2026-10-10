import { useState, type FormEvent } from "react";
import { useNostr } from "../context/NostrContext";
import { Avatar } from "../components/Avatar";
import { PostCard } from "../components/PostCard";
import { Button } from "../components/dads/Button/Button";
import { Label } from "../components/dads/Label/Label";
import { Textarea } from "../components/dads/Textarea/Textarea";

export function HomePage() {
  const {
    pubkey,
    profile,
    following,
    events,
    feedMode,
    loading,
    connect,
    loadTimeline,
    publish,
    setNotice,
  } = useNostr();
  const [content, setContent] = useState("");

  async function submitPost(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    const text = content.trim();
    if (!text) return;
    try {
      await publish(text);
      setContent("");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "投稿できませんでした。");
    }
  }

  const olderThan = events.length
    ? Math.min(...events.map((event) => event.created_at)) - 1
    : undefined;

  return (
    <>
      <header className="border-b border-solid-gray-300 px-4 py-5 sm:px-6">
        <h1 className="text-2xl font-bold">ホーム</h1>
        <p className="mt-1 text-sm text-solid-gray-600">
          リレーから届いた投稿を新しい順に表示します。
        </p>
      </header>

      {pubkey ? (
        <form className="border-b border-solid-gray-300 px-4 py-5 sm:px-6" onSubmit={submitPost}>
          <div className="flex gap-3">
            <Avatar profile={profile} pubkey={pubkey} />
            <div className="min-w-0 flex-1">
              <Label className="mb-2 block" htmlFor="new-post" size="sm">
                新しい投稿
              </Label>
              <Textarea
                className="w-full"
                id="new-post"
                maxLength={10_000}
                onChange={(event) => setContent(event.target.value)}
                rows={3}
                value={content}
              />
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="text-sm text-solid-gray-600">
                  投稿は選択中の書き込みリレーへ送信されます。
                </span>
                <Button disabled={!content.trim()} size="sm" type="submit" variant="solid-fill">
                  投稿する
                </Button>
              </div>
            </div>
          </div>
        </form>
      ) : (
        <section
          className="border-b border-solid-gray-300 bg-solid-gray-50 px-4 py-5 sm:px-6"
          aria-labelledby="signin-title"
        >
          <h2 className="text-lg font-bold" id="signin-title">
            公開投稿を閲覧中
          </h2>
          <p className="mt-1 text-sm leading-6 text-solid-gray-700">
            NIP-07署名拡張を接続すると、投稿やリアクションができます。秘密鍵はこのアプリに渡りません。
          </p>
          <Button className="mt-3" onClick={() => void connect()} size="sm" variant="outline">
            署名拡張に接続
          </Button>
        </section>
      )}

      <div
        className="grid grid-cols-2 border-b border-solid-gray-300"
        role="group"
        aria-label="タイムライン"
      >
        <button
          aria-pressed={feedMode === "following"}
          className={`min-h-14 border-b-4 px-3 font-bold focus-visible:outline focus-visible:outline-4 focus-visible:outline-black focus-visible:ring-2 focus-visible:ring-yellow-300 ${feedMode === "following" ? "border-key-900 text-key-1000" : "border-transparent text-solid-gray-700 hover:bg-solid-gray-50"}`}
          disabled={!pubkey || following.length === 0}
          onClick={() => void loadTimeline("following")}
          type="button"
        >
          フォロー中
        </button>
        <button
          aria-pressed={feedMode === "global"}
          className={`min-h-14 border-b-4 px-3 font-bold focus-visible:outline focus-visible:outline-4 focus-visible:outline-black focus-visible:ring-2 focus-visible:ring-yellow-300 ${feedMode === "global" ? "border-key-900 text-key-1000" : "border-transparent text-solid-gray-700 hover:bg-solid-gray-50"}`}
          onClick={() => void loadTimeline("global")}
          type="button"
        >
          公開
        </button>
      </div>

      <section aria-label="タイムライン" aria-busy={loading}>
        {events.length ? (
          events.map((event) => <PostCard event={event} key={event.id} />)
        ) : (
          <div className="px-6 py-14 text-center">
            <h2 className="text-lg font-bold">
              {loading ? "投稿を読み込み中です" : "投稿がありません"}
            </h2>
            <p className="mt-2 text-sm leading-6 text-solid-gray-600">
              {feedMode === "following" && following.length === 0
                ? "フォロー中のアカウントがまだありません。公開タイムラインを見たり、検索からアカウントを探したりできます。"
                : "リレーに投稿が届くと、ここに表示されます。"}
            </p>
          </div>
        )}
      </section>

      {events.length > 0 && (
        <div className="flex justify-center px-4 py-6">
          <Button
            disabled={loading}
            onClick={() => void loadTimeline(feedMode, olderThan, true)}
            size="md"
            variant="outline"
          >
            {loading ? "読み込み中…" : "さらに読み込む"}
          </Button>
        </div>
      )}
    </>
  );
}
