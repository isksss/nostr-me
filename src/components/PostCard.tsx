import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Event } from "nostr-tools";
import { verifyEvent } from "nostr-tools/pure";
import { useNostr } from "../context/NostrContext";
import { publicKeyLabel, type Profile, type ReactionSummary } from "../lib/nostr";
import { splitPostContent } from "../lib/postContent";
import { Avatar } from "./Avatar";
import { Button } from "./dads/Button/Button";
import { Textarea } from "./dads/Textarea/Textarea";
import { Icon } from "./Icon";

function relativeTime(timestamp: number): string {
  const seconds = Math.floor(Date.now() / 1_000) - timestamp;
  const formatter = new Intl.RelativeTimeFormat("ja", { numeric: "auto" });
  if (seconds < 60) return formatter.format(-seconds, "second");
  if (seconds < 3_600) return formatter.format(-Math.floor(seconds / 60), "minute");
  if (seconds < 86_400) return formatter.format(-Math.floor(seconds / 3_600), "hour");
  return formatter.format(-Math.floor(seconds / 86_400), "day");
}

function nestedEvent(event: Event): Event | undefined {
  if (event.kind !== 6) return undefined;
  try {
    const value = JSON.parse(event.content) as Event;
    return value && value.kind === 1 && /^[0-9a-f]{64}$/i.test(value.id) && verifyEvent(value)
      ? value
      : undefined;
  } catch {
    return undefined;
  }
}

function displayName(profile: Profile | undefined, pubkey: string): string {
  return profile?.display_name || profile?.name || publicKeyLabel(pubkey).slice(0, 16);
}

type PostReactionSummary = ReactionSummary & { eventId: string; pubkey: string | null };

export function PostCard({ event, full = false }: { event: Event; full?: boolean }) {
  const {
    pubkey,
    profiles,
    reply,
    react,
    repost,
    deletePost,
    reportPost,
    loadReplies,
    reactionSummary,
    setNotice,
  } = useNostr();
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [threadOpen, setThreadOpen] = useState(false);
  const [thread, setThread] = useState<Event[]>([]);
  const [reactionState, setReactionState] = useState<PostReactionSummary>();
  const [reactionLoadError, setReactionLoadError] = useState(false);
  const [reacting, setReacting] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportCategory, setReportCategory] = useState("spam");
  const [deleted, setDeleted] = useState(false);
  const reposted = nestedEvent(event);
  const post = reposted ?? event;
  const author = profiles[post.pubkey];
  const repostAuthor = reposted ? profiles[event.pubkey] : undefined;
  const reactions =
    reactionState?.eventId === post.id && reactionState.pubkey === pubkey
      ? reactionState
      : undefined;

  useEffect(() => {
    let active = true;
    setReactionState(undefined);
    setReactionLoadError(false);
    void reactionSummary(post.id)
      .then((summary) => {
        if (active) setReactionState({ ...summary, eventId: post.id, pubkey });
      })
      .catch(() => {
        if (active) {
          setReactionLoadError(true);
          setNotice("リアクションを読み込めませんでした。");
        }
      });
    return () => {
      active = false;
    };
  }, [post.id, pubkey, reactionSummary, setNotice]);

  async function submitReply(eventForm: React.FormEvent<HTMLFormElement>) {
    eventForm.preventDefault();
    if (!replyText.trim()) return;
    try {
      await reply(post, replyText.trim());
      setReplyText("");
      setReplyOpen(false);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "返信できませんでした。");
    }
  }

  async function handleAction(action: () => Promise<unknown>) {
    try {
      await action();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "操作に失敗しました。");
    }
  }

  async function submitReaction() {
    if (!pubkey || !reactions || reactions.reacted || reacting) return;
    setReacting(true);
    try {
      await react(post);
      setReactionState((current) =>
        current?.eventId === post.id && current.pubkey === pubkey
          ? {
              ...current,
              counts: { ...current.counts, "👍": (current.counts["👍"] ?? 0) + 1 },
              reacted: true,
            }
          : current,
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "リアクションできませんでした。");
    } finally {
      setReacting(false);
    }
  }

  if (deleted) return null;

  return (
    <article className="border-b border-solid-gray-300 px-4 py-5 sm:px-6" aria-label="投稿">
      {reposted && (
        <p className="mb-3 flex items-center gap-2 pl-14 text-sm text-solid-gray-600">
          <Icon name="repost" size={16} />
          {displayName(repostAuthor, event.pubkey)}さんがリポスト
        </p>
      )}
      <div className="flex gap-3">
        <Link
          aria-label={`${displayName(author, post.pubkey)}のプロフィール`}
          className="shrink-0 rounded-full focus-visible:outline focus-visible:outline-4 focus-visible:outline-black focus-visible:outline-offset-2 focus-visible:ring-2 focus-visible:ring-yellow-300"
          to={`/profile/${post.pubkey}`}
        >
          <Avatar profile={author} pubkey={post.pubkey} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link
              className="font-bold text-solid-gray-900 underline-offset-2 hover:underline"
              to={`/profile/${post.pubkey}`}
            >
              {displayName(author, post.pubkey)}
            </Link>
            {author?.nip05 && <span className="text-sm text-solid-gray-600">{author.nip05}</span>}
            <span
              className="text-sm text-solid-gray-600"
              title={new Date(post.created_at * 1_000).toLocaleString("ja-JP")}
            >
              · {relativeTime(post.created_at)}
            </span>
          </div>
          {post.kind === 30023 && (
            <h2 className="mt-3 text-xl font-bold">
              {post.tags.find((tag) => tag[0] === "title")?.[1] || "タイトルなし"}
            </h2>
          )}
          <div className="mt-2 whitespace-pre-wrap break-words text-[1rem] leading-7 text-solid-gray-900">
            {splitPostContent(
              (post.kind === 30023 && !full ? post.content.slice(0, 800) : post.content) ||
                "（本文なし）",
            ).map((part, index) =>
              "image" in part ? (
                <img
                  alt="投稿に添付された画像"
                  className="my-2 block max-h-[32rem] max-w-full rounded-8 object-contain"
                  decoding="async"
                  key={index}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  src={part.image}
                />
              ) : (
                <span key={index}>{part.text}</span>
              ),
            )}
          </div>
          {post.kind === 30023 && !full && post.content.length > 800 && (
            <Link className="mt-2 inline-block text-key-1000 underline" to={`/event/${post.id}`}>
              記事を読む
            </Link>
          )}
          <div className="mt-3 flex flex-wrap gap-x-2 gap-y-1" aria-label="投稿への操作">
            <Button
              aria-label="返信"
              className="gap-2 !min-w-0 !px-2"
              onClick={() => setReplyOpen((open) => !open)}
              size="xs"
              variant="text"
            >
              <Icon name="reply" size={18} />
              <span>返信</span>
            </Button>
            <Button
              className="!min-w-0 !px-2"
              onClick={() => {
                setThreadOpen((open) => !open);
                if (!thread.length)
                  void loadReplies(post)
                    .then(setThread)
                    .catch(() => setNotice("返信を読み込めませんでした。"));
              }}
              size="xs"
              variant="text"
            >
              返信を見る{thread.length ? ` (${thread.length})` : ""}
            </Button>
            <Button
              aria-label={reactions?.reacted ? "リアクション済み" : "👍でリアクション"}
              className="gap-2 !min-w-0 !px-2"
              disabled={!pubkey || !reactions || reactions.reacted || reacting}
              onClick={() => void submitReaction()}
              size="xs"
              variant="text"
            >
              <span aria-hidden="true">👍</span>
              <span>
                {reacting ? "送信中" : reactions?.reacted ? "リアクション済み" : "リアクション"}
              </span>
            </Button>
            <span
              aria-label="リアクション数"
              className="px-2 text-sm"
              role="group"
              aria-live="polite"
            >
              {reactions
                ? Object.entries(reactions.counts)
                    .map(([emoji, count]) => `${emoji} ${count}`)
                    .join(" · ") || "リアクションなし"
                : reactionLoadError
                  ? "読み込めませんでした"
                  : "読み込み中"}
            </span>
            <Button
              aria-label="リポスト"
              className="gap-2 !min-w-0 !px-2"
              disabled={!pubkey}
              onClick={() => void handleAction(() => repost(post))}
              size="xs"
              variant="text"
            >
              <Icon name="repost" size={18} />
              <span>リポスト</span>
            </Button>
            {pubkey === post.pubkey && (
              <Button
                className="!min-w-0 !px-2"
                onClick={() => {
                  if (
                    window.confirm(
                      "この投稿の削除リクエストを公開します。リレー上の削除は保証されません。続けますか？",
                    )
                  ) {
                    void deletePost(post)
                      .then(() => setDeleted(true))
                      .catch((error) =>
                        setNotice(
                          error instanceof Error
                            ? error.message
                            : "削除リクエストを送れませんでした。",
                        ),
                      );
                  }
                }}
                size="xs"
                variant="text"
              >
                削除
              </Button>
            )}
            <Button
              className="!min-w-0 !px-2"
              onClick={() => setReportOpen((open) => !open)}
              size="xs"
              variant="text"
            >
              報告
            </Button>
          </div>
          {reportOpen && (
            <form
              className="mt-3 flex flex-wrap items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void reportPost(post, reportCategory)
                  .then(() => {
                    setReportOpen(false);
                    setNotice("報告を送信しました。");
                  })
                  .catch((error) =>
                    setNotice(
                      error instanceof Error ? error.message : "報告を送信できませんでした。",
                    ),
                  );
              }}
            >
              <label className="text-sm" htmlFor={`report-${post.id}`}>
                報告理由
              </label>
              <select
                className="min-h-10 rounded-4 border border-solid-gray-300 px-2"
                id={`report-${post.id}`}
                onChange={(event) => setReportCategory(event.target.value)}
                value={reportCategory}
              >
                <option value="spam">スパム</option>
                <option value="nudity">露骨な内容</option>
                <option value="malware">マルウェア</option>
                <option value="illegal">違法な内容</option>
                <option value="impersonation">なりすまし</option>
                <option value="profanity">不適切な表現</option>
                <option value="other">その他</option>
              </select>
              <Button size="xs" type="submit" variant="outline">
                報告を送信
              </Button>
            </form>
          )}
          {threadOpen && (
            <div className="mt-3 border-l-2 border-solid-gray-300 pl-3" aria-label="返信一覧">
              {thread.length ? (
                thread.map((item) => (
                  <p
                    className="border-b border-solid-gray-200 py-2 text-sm leading-6"
                    key={item.id}
                  >
                    <Link className="font-bold underline" to={`/profile/${item.pubkey}`}>
                      {publicKeyLabel(item.pubkey).slice(0, 16)}
                    </Link>
                    <span className="ml-2 whitespace-pre-wrap break-words">{item.content}</span>
                  </p>
                ))
              ) : (
                <p className="py-2 text-sm text-solid-gray-600">返信はありません。</p>
              )}
            </div>
          )}
          {replyOpen && (
            <form className="mt-3 space-y-3 border-l-4 border-key-300 pl-4" onSubmit={submitReply}>
              <label className="sr-only" htmlFor={`reply-${post.id}`}>
                返信内容
              </label>
              <Textarea
                className="w-full"
                id={`reply-${post.id}`}
                maxLength={10_000}
                onChange={(eventInput) => setReplyText(eventInput.target.value)}
                rows={3}
                value={replyText}
              />
              <div className="flex justify-end gap-2">
                <Button onClick={() => setReplyOpen(false)} size="sm" variant="text">
                  キャンセル
                </Button>
                <Button
                  disabled={!pubkey || !replyText.trim()}
                  size="sm"
                  type="submit"
                  variant="solid-fill"
                >
                  返信を送信
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </article>
  );
}
