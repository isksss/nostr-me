import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Button } from "../components/dads/Button/Button";
import { Input } from "../components/dads/Input/Input";
import { Label } from "../components/dads/Label/Label";
import { Textarea } from "../components/dads/Textarea/Textarea";
import { useNostr } from "../context/NostrContext";
import { decodeNostrIdentifier, publicKeyLabel, type DirectMessage } from "../lib/nostr";

function resolvePubkey(input: string): string | undefined {
  const value = input.trim();
  if (/^[0-9a-f]{64}$/i.test(value)) return value.toLowerCase();
  const decoded = decodeNostrIdentifier(value);
  return decoded?.type === "profile" ? decoded.pubkey : undefined;
}

export function MessagesPage() {
  const { pubkey, loadDirectMessages, sendDirectMessage, setNotice } = useNostr();
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [recipient, setRecipient] = useState("");
  const [content, setContent] = useState("");
  const [legacy, setLegacy] = useState(false);
  const [loading, setLoading] = useState(false);
  const peer = resolvePubkey(recipient);
  const peers = useMemo(() => [...new Set(messages.map((message) => message.peer))], [messages]);
  const conversation = messages.filter((message) => message.peer === peer);

  async function load() {
    if (!pubkey) return;
    setLoading(true);
    try {
      setMessages(await loadDirectMessages());
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "DMを読み込めませんでした。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setMessages([]);
    if (pubkey) void load();
  }, [pubkey]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!peer || !content.trim()) return;
    try {
      await sendDirectMessage(peer, content.trim(), legacy);
      setContent("");
      setNotice(legacy ? "NIP-04 DMを送信しました。" : "NIP-17 DMを送信しました。");
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "DMを送信できませんでした。");
    }
  }

  return (
    <>
      <header className="flex items-center justify-between border-b border-solid-gray-300 px-4 py-5 sm:px-6">
        <div>
          <h1 className="text-2xl font-bold">ダイレクトメッセージ</h1>
          <p className="mt-1 text-sm text-solid-gray-600">
            NIP-17/44で暗号化して送信します。受信側が対応する署名者を必要とします。
          </p>
        </div>
        {pubkey && (
          <Button disabled={loading} onClick={() => void load()} size="sm" variant="outline">
            更新
          </Button>
        )}
      </header>
      {!pubkey ? (
        <p className="px-6 py-12 text-center text-solid-gray-700">
          DMを見るには署名者に接続してください。
        </p>
      ) : (
        <>
          <section className="border-b border-solid-gray-300 p-4 sm:p-6">
            <Label className="mb-2 block" htmlFor="dm-recipient">
              宛先（hex公開鍵またはnpub）
            </Label>
            <Input
              autoCapitalize="none"
              autoComplete="off"
              id="dm-recipient"
              onChange={(event) => setRecipient(event.target.value)}
              value={recipient}
            />
            {!peer && recipient && (
              <p className="mt-2 text-sm text-error-1" role="alert">
                公開鍵を読み取れません。
              </p>
            )}
            {peers.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2" aria-label="会話">
                {peers.map((item) => (
                  <Button
                    key={item}
                    onClick={() => setRecipient(item)}
                    size="xs"
                    variant={item === peer ? "solid-fill" : "outline"}
                  >
                    {publicKeyLabel(item).slice(0, 18)}
                  </Button>
                ))}
              </div>
            )}
          </section>
          {peer && (
            <section
              className="border-b border-solid-gray-300 p-4 sm:p-6"
              aria-label="メッセージ一覧"
              aria-busy={loading}
            >
              {conversation.map((message) => (
                <article
                  className={`mb-3 max-w-[90%] rounded-8 border border-solid-gray-300 p-3 ${message.pubkey === pubkey ? "ml-auto bg-key-50" : "bg-white"}`}
                  key={message.id}
                >
                  <p className="whitespace-pre-wrap break-words">{message.content}</p>
                  <time
                    className="mt-2 block text-right text-xs text-solid-gray-600"
                    dateTime={new Date(message.created_at * 1000).toISOString()}
                  >
                    {new Date(message.created_at * 1000).toLocaleString("ja-JP")}
                  </time>
                </article>
              ))}
              {!conversation.length && (
                <p className="py-4 text-center text-sm text-solid-gray-600">
                  {loading ? "読み込み中です" : "この相手とのメッセージはありません。"}
                </p>
              )}
            </section>
          )}
          <form className="space-y-3 p-4 sm:p-6" onSubmit={submit}>
            <Label className="mb-2 block" htmlFor="dm-content">
              メッセージ
            </Label>
            <Textarea
              className="w-full"
              id="dm-content"
              maxLength={10_000}
              onChange={(event) => setContent(event.target.value)}
              rows={4}
              value={content}
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                checked={legacy}
                onChange={(event) => setLegacy(event.target.checked)}
                type="checkbox"
              />
              旧式NIP-04で送信（互換性のため）
            </label>
            <div className="flex justify-end">
              <Button
                disabled={!peer || !content.trim()}
                size="sm"
                type="submit"
                variant="solid-fill"
              >
                暗号化して送信
              </Button>
            </div>
          </form>
          <p className="px-4 pb-5 text-sm leading-6 text-solid-gray-600 sm:px-6">
            NIP-17の復号は接続中のNIP-07拡張またはNIP-46署名サーバーに委ねます。リレーには暗号文と接続情報が見えます。取得済みのDMはページを閉じると破棄されます。
          </p>
        </>
      )}
    </>
  );
}
