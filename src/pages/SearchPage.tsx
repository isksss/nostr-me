import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useNostr } from "../context/NostrContext";
import { Avatar } from "../components/Avatar";
import { PostCard } from "../components/PostCard";
import { Button } from "../components/dads/Button/Button";
import { Input } from "../components/dads/Input/Input";
import { Label } from "../components/dads/Label/Label";
import type { Event } from "nostr-tools";

export function SearchPage() {
  const { profiles, search, relays, setNotice } = useNostr();
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [results, setResults] = useState<Event[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    setSearchParams({ q: query.trim() });
    try {
      setResults(await search(query));
    } catch {
      setNotice("検索中にエラーが発生しました。");
    } finally {
      setLoading(false);
    }
  }

  const people = [
    ...new Map(
      results.filter((event) => event.kind === 0).map((event) => [event.pubkey, event]),
    ).values(),
  ];
  const posts = results.filter((event) => event.kind === 1);

  return (
    <>
      <header className="border-b border-solid-gray-300 px-4 py-5 sm:px-6">
        <h1 className="text-2xl font-bold">検索</h1>
        <form className="mt-4 flex items-end gap-3" onSubmit={submit} role="search">
          <div className="min-w-0 flex-1">
            <Label className="mb-2 block" htmlFor="search-query" size="sm">
              ユーザー・投稿を検索
            </Label>
            <Input
              autoComplete="off"
              id="search-query"
              onChange={(event) => setQuery(event.target.value)}
              type="search"
              value={query}
            />
          </div>
          <Button disabled={!query.trim() || loading} size="md" type="submit" variant="solid-fill">
            {loading ? "検索中…" : "検索"}
          </Button>
        </form>
        <p className="mt-2 text-sm leading-6 text-solid-gray-600">
          NIP-50対応リレーを検索し、取得済みの投稿もあわせて調べます。現在の検索先は
          {relays.read.length}局です。
        </p>
      </header>

      {people.length > 0 && (
        <section aria-labelledby="people-heading">
          <h2
            className="border-b border-solid-gray-300 px-4 py-3 text-lg font-bold sm:px-6"
            id="people-heading"
          >
            アカウント
          </h2>
          {people.map((person) => {
            const profile = profiles[person.pubkey];
            return (
              <Link
                className="flex items-center gap-3 border-b border-solid-gray-300 px-4 py-4 hover:bg-solid-gray-50 focus-visible:outline focus-visible:outline-4 focus-visible:outline-black focus-visible:ring-2 focus-visible:ring-yellow-300 sm:px-6"
                key={person.pubkey}
                to={`/profile/${person.pubkey}`}
              >
                <Avatar profile={profile} pubkey={person.pubkey} />
                <span className="min-w-0">
                  <span className="block truncate font-bold">
                    {profile?.display_name || profile?.name || "名前未設定"}
                  </span>
                  <span className="block truncate text-sm text-solid-gray-600">
                    {profile?.about || person.pubkey}
                  </span>
                </span>
              </Link>
            );
          })}
        </section>
      )}

      {posts.length > 0 && (
        <section aria-labelledby="posts-heading">
          <h2
            className="border-b border-solid-gray-300 px-4 py-3 text-lg font-bold sm:px-6"
            id="posts-heading"
          >
            投稿
          </h2>
          {posts.map((post) => (
            <PostCard event={post} key={post.id} />
          ))}
        </section>
      )}

      {searched && !loading && results.length === 0 && (
        <p className="px-6 py-10 text-center text-solid-gray-700" role="status">
          一致する結果が見つかりませんでした。
        </p>
      )}
      {!searched && (
        <p className="px-6 py-10 text-center text-solid-gray-700">検索語を入力してください。</p>
      )}
    </>
  );
}
