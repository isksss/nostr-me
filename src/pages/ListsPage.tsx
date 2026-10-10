import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import type { Event } from "nostr-tools";
import { Button } from "../components/dads/Button/Button";
import { Label } from "../components/dads/Label/Label";
import { Input } from "../components/dads/Input/Input";
import { Textarea } from "../components/dads/Textarea/Textarea";
import { useNostr } from "../context/NostrContext";
import { decodeNostrIdentifier, publicKeyLabel } from "../lib/nostr";

function memberKeys(value: string): string[] {
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const keys = lines.map((item) => {
    if (/^[0-9a-f]{64}$/i.test(item)) return item.toLowerCase();
    const decoded = decodeNostrIdentifier(item);
    if (decoded?.type === "profile") return decoded.pubkey;
    throw new Error(`公開鍵を読み取れません: ${item}`);
  });
  if (!keys.length) throw new Error("公開鍵を1件以上入力してください。");
  return keys;
}

export function ListsPage() {
  const { pubkey, loadLists, savePeopleList, setNotice } = useNostr();
  const [lists, setLists] = useState<Event[]>([]);
  const [title, setTitle] = useState("");
  const [members, setMembers] = useState("");

  async function load() {
    try {
      setLists(await loadLists());
    } catch {
      setNotice("リストを読み込めませんでした。");
    }
  }

  useEffect(() => {
    void load();
  }, [pubkey]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await savePeopleList(title, memberKeys(members));
      setTitle("");
      setMembers("");
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "リストを保存できませんでした。");
    }
  }

  return (
    <>
      <header className="border-b border-solid-gray-300 px-4 py-5 sm:px-6">
        <h1 className="text-2xl font-bold">リスト</h1>
        <p className="mt-1 text-sm text-solid-gray-600">NIP-51の公開人物リストを管理します。</p>
      </header>
      {pubkey && (
        <form className="space-y-4 border-b border-solid-gray-300 p-4 sm:p-6" onSubmit={submit}>
          <h2 className="text-lg font-bold">人物リストを公開</h2>
          <div>
            <Label className="mb-2 block" htmlFor="list-title">
              リスト名
            </Label>
            <Input
              id="list-title"
              maxLength={128}
              onChange={(event) => setTitle(event.target.value)}
              required
              value={title}
            />
          </div>
          <div>
            <Label className="mb-2 block" htmlFor="list-members">
              公開鍵（1行に1つ、hexまたはnpub）
            </Label>
            <Textarea
              className="w-full font-mono text-sm"
              id="list-members"
              onChange={(event) => setMembers(event.target.value)}
              rows={5}
              value={members}
            />
          </div>
          <div className="flex justify-end">
            <Button
              disabled={!title.trim() || !members.trim()}
              size="sm"
              type="submit"
              variant="solid-fill"
            >
              公開リストを保存
            </Button>
          </div>
        </form>
      )}
      {lists.map((list) => (
        <section className="border-b border-solid-gray-300 px-4 py-5 sm:px-6" key={list.id}>
          <h2 className="font-bold">
            {list.tags.find((tag) => tag[0] === "title")?.[1] ||
              list.tags.find((tag) => tag[0] === "d")?.[1] ||
              "名前のないリスト"}
          </h2>
          <p className="mt-1 text-sm text-solid-gray-600">kind {list.kind}</p>
          <ul className="mt-3 space-y-2">
            {list.tags
              .filter((tag) => ["p", "e", "a"].includes(tag[0]) && tag[1])
              .map((tag) => (
                <li key={`${list.id}-${tag[0]}-${tag[1]}`}>
                  {tag[0] === "p" ? (
                    <Link className="text-key-1000 underline" to={`/profile/${tag[1]}`}>
                      {publicKeyLabel(tag[1])}
                    </Link>
                  ) : tag[0] === "e" ? (
                    <Link className="text-key-1000 underline" to={`/event/${tag[1]}`}>
                      投稿: {tag[1]}
                    </Link>
                  ) : (
                    <span className="break-all text-sm">記事: {tag[1]}</span>
                  )}
                </li>
              ))}
          </ul>
        </section>
      ))}
      {!lists.length && (
        <p className="px-6 py-12 text-center text-solid-gray-700" role="status">
          公開リストはありません。
        </p>
      )}
    </>
  );
}
