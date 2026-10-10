import { useEffect, useState, type FormEvent } from "react";
import type { Event } from "nostr-tools";
import { PostCard } from "../components/PostCard";
import { Button } from "../components/dads/Button/Button";
import { Label } from "../components/dads/Label/Label";
import { Input } from "../components/dads/Input/Input";
import { Textarea } from "../components/dads/Textarea/Textarea";
import { useNostr } from "../context/NostrContext";
import { readLongForms } from "../lib/nostr";

export function ArticlesPage() {
  const { pubkey, relays, publishArticle, setNotice } = useNostr();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [articles, setArticles] = useState<Event[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setArticles(await readLongForms(relays.read));
    } catch {
      setNotice("記事を読み込めませんでした。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [relays.read]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await publishArticle(title, content);
      setTitle("");
      setContent("");
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "記事を公開できませんでした。");
    }
  }

  return (
    <>
      <header className="border-b border-solid-gray-300 px-4 py-5 sm:px-6">
        <h1 className="text-2xl font-bold">長文記事</h1>
        <p className="mt-1 text-sm text-solid-gray-600">NIP-23 kind 30023の記事を表示します。</p>
      </header>
      {pubkey && (
        <form className="space-y-4 border-b border-solid-gray-300 p-4 sm:p-6" onSubmit={submit}>
          <h2 className="text-lg font-bold">記事を公開</h2>
          <div>
            <Label className="mb-2 block" htmlFor="article-title">
              タイトル
            </Label>
            <Input
              id="article-title"
              maxLength={256}
              onChange={(event) => setTitle(event.target.value)}
              required
              value={title}
            />
          </div>
          <div>
            <Label className="mb-2 block" htmlFor="article-content">
              本文
            </Label>
            <Textarea
              className="w-full"
              id="article-content"
              maxLength={100_000}
              onChange={(event) => setContent(event.target.value)}
              required
              rows={10}
              value={content}
            />
          </div>
          <div className="flex justify-end">
            <Button
              disabled={!title.trim() || !content.trim()}
              size="sm"
              type="submit"
              variant="solid-fill"
            >
              記事を公開
            </Button>
          </div>
        </form>
      )}
      {articles.length ? (
        articles.map((article) => <PostCard event={article} key={article.id} />)
      ) : (
        <p className="px-6 py-12 text-center text-solid-gray-700" role="status">
          {loading ? "記事を読み込み中です" : "記事がありません。"}
        </p>
      )}
    </>
  );
}
