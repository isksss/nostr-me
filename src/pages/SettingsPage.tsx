import { useEffect, useState, type FormEvent } from "react";
import { useNostr } from "../context/NostrContext";
import { Button } from "../components/dads/Button/Button";
import { Label } from "../components/dads/Label/Label";
import { Textarea } from "../components/dads/Textarea/Textarea";

export function SettingsPage() {
  const { pubkey, relays, connectedCount, saveRelays } = useNostr();
  const [readText, setReadText] = useState(relays.read.join("\n"));
  const [writeText, setWriteText] = useState(relays.write.join("\n"));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setReadText(relays.read.join("\n"));
    setWriteText(relays.write.join("\n"));
  }, [relays.read, relays.write]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      await saveRelays({
        read: readText
          .split(/\r?\n/)
          .map((url) => url.trim())
          .filter(Boolean),
        write: writeText
          .split(/\r?\n/)
          .map((url) => url.trim())
          .filter(Boolean),
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "リレー設定を保存できませんでした。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <header className="border-b border-solid-gray-300 px-4 py-5 sm:px-6">
        <h1 className="text-2xl font-bold">設定</h1>
        <p className="mt-1 text-sm text-solid-gray-600">接続先とプライバシーを管理します。</p>
      </header>
      <section className="border-b border-solid-gray-300 p-4 sm:p-6" aria-labelledby="relays-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold" id="relays-title">
              Nostrリレー
            </h2>
            <p className="mt-1 text-sm text-solid-gray-600">接続状態: {connectedCount}局</p>
          </div>
          <span className="rounded-full bg-key-50 px-3 py-1 text-sm font-bold text-key-1000">
            {pubkey ? "アカウント設定" : "このブラウザーの設定"}
          </span>
        </div>
        <form className="mt-5 space-y-4" onSubmit={submit}>
          <div>
            <Label className="mb-2 block" htmlFor="read-relays">
              読み込み用リレー（1行に1つ）
            </Label>
            <Textarea
              className="w-full font-mono text-sm"
              id="read-relays"
              onChange={(event) => setReadText(event.target.value)}
              rows={5}
              value={readText}
            />
          </div>
          <div>
            <Label className="mb-2 block" htmlFor="write-relays">
              書き込み用リレー（1行に1つ）
            </Label>
            <Textarea
              className="w-full font-mono text-sm"
              id="write-relays"
              onChange={(event) => setWriteText(event.target.value)}
              rows={5}
              value={writeText}
            />
          </div>
          {error && (
            <p className="text-error-1" role="alert">
              {error}
            </p>
          )}
          <Button disabled={saving} size="sm" type="submit" variant="solid-fill">
            {saving ? "保存中…" : "リレー設定を保存"}
          </Button>
        </form>
        <p className="mt-4 text-sm leading-6 text-solid-gray-600">
          初期設定ではrelay.damus.io、nos.lol、relay.primal.netへ接続します。NIP-65のリレー一覧があるアカウントでは、その一覧が優先されます。
        </p>
      </section>
      <section className="p-4 sm:p-6" aria-labelledby="privacy-title">
        <h2 className="text-lg font-bold" id="privacy-title">
          データとプライバシー
        </h2>
        <ul className="mt-3 list-disc space-y-2 pl-6 text-sm leading-6 text-solid-gray-700">
          <li>秘密鍵は保存しません。投稿などの署名はNIP-07対応拡張に委ねます。</li>
          <li>投稿・検索・プロフィールのリクエストはブラウザーから各リレーへ直接送信します。</li>
          <li>接続先リレーにはIPアドレスとアクセス情報が伝わる場合があります。</li>
          <li>
            Webフォントやプロフィール画像の配信元へブラウザーから接続します。相手にIPアドレス等が伝わる場合があります。
          </li>
          <li>
            投稿の表示は現在接続できるリレーに依存します。すべてのリレーが同じイベントを保持するとは限りません。
          </li>
        </ul>
      </section>
    </>
  );
}
