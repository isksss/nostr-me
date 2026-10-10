import { useState } from "react";
import { Link } from "react-router-dom";
import type { Event } from "nostr-tools";
import { verifyEvent } from "nostr-tools/pure";
import { useNostr } from "../context/NostrContext";
import { publicKeyLabel, type Profile } from "../lib/nostr";
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

export function PostCard({ event }: { event: Event }) {
  const { pubkey, profiles, reply, react, repost, setNotice } = useNostr();
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState("");
  const reposted = nestedEvent(event);
  const post = reposted ?? event;
  const author = profiles[post.pubkey];
  const repostAuthor = reposted ? profiles[event.pubkey] : undefined;

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
          <p className="mt-2 whitespace-pre-wrap break-words text-[1rem] leading-7 text-solid-gray-900">
            {post.content || "（本文なし）"}
          </p>
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
              aria-label="いいね"
              className="gap-2 !min-w-0 !px-2"
              disabled={!pubkey}
              onClick={() => void handleAction(() => react(post))}
              size="xs"
              variant="text"
            >
              <Icon name="heart" size={18} />
              <span>いいね</span>
            </Button>
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
          </div>
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
