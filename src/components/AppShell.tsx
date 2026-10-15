import { useState, type FormEvent } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useNostr } from "../context/NostrContext";
import { Avatar } from "./Avatar";
import { Button } from "./dads/Button/Button";
import { Input } from "./dads/Input/Input";
import { Icon, type IconName } from "./Icon";

const navigation: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: "/", label: "ホーム", icon: "home", end: true },
  { to: "/search", label: "検索", icon: "search" },
  { to: "/notifications", label: "通知", icon: "bell" },
  { to: "/profile", label: "プロフィール", icon: "user" },
  { to: "/settings", label: "設定", icon: "settings" },
  { to: "/tools", label: "その他", icon: "more" },
];

export function AppShell() {
  const {
    pubkey,
    profile,
    relays,
    connectedCount,
    notice,
    setNotice,
    connect,
    connectBunker,
    disconnect,
    signerKind,
  } = useNostr();
  const hasExtension = Boolean(window.nostr);
  const [bunkerOpen, setBunkerOpen] = useState(false);
  const [bunkerInput, setBunkerInput] = useState("");

  async function submitBunker(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await connectBunker(bunkerInput);
      setBunkerOpen(false);
      setBunkerInput("");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "NIP-46接続に失敗しました。");
    }
  }

  return (
    <div className="min-h-screen bg-white text-solid-gray-900">
      <a
        className="fixed left-3 top-3 z-50 -translate-y-20 rounded-4 bg-white p-3 text-key-1000 underline focus:translate-y-0 focus:outline focus:outline-4 focus:outline-black focus:ring-2 focus:ring-yellow-300"
        href="#main"
      >
        メインコンテンツへ移動
      </a>
      <header className="sticky top-0 z-30 border-b border-solid-gray-300 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-4 sm:px-6">
          <NavLink aria-label="nostr.me ホーム" className="flex items-center gap-3" to="/">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-key-900 text-sm font-bold text-white">
              n
            </span>
            <span className="text-xl font-bold tracking-tight">nostr.me</span>
          </NavLink>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-solid-gray-600 sm:inline">
              {connectedCount > 0
                ? `${connectedCount}局に接続中`
                : `${relays.read.length}局へ接続中`}
            </span>
            {pubkey ? (
              <>
                <span className="hidden text-xs text-solid-gray-600 sm:inline">
                  {signerKind === "nip46" ? "NIP-46" : "NIP-07"}
                </span>
                <Button onClick={disconnect} size="sm" variant="outline">
                  ログアウト
                </Button>
              </>
            ) : (
              <>
                <Button onClick={() => void connect()} size="sm" variant="solid-fill">
                  {hasExtension ? "ログイン" : "NIP-07で接続"}
                </Button>
                <Button
                  aria-expanded={bunkerOpen}
                  onClick={() => setBunkerOpen((open) => !open)}
                  size="sm"
                  variant="outline"
                >
                  NIP-46
                </Button>
              </>
            )}
          </div>
        </div>
        {bunkerOpen && !pubkey && (
          <form
            className="mx-auto flex max-w-[1440px] flex-wrap items-end gap-3 border-t border-solid-gray-300 px-4 py-3 sm:px-6"
            onSubmit={submitBunker}
          >
            <label className="min-w-0 flex-1 text-sm font-bold" htmlFor="bunker-input">
              NIP-46接続先（bunker:// URLまたはNIP-05）
              <Input
                autoComplete="off"
                autoCapitalize="none"
                blockSize="md"
                className="mt-1 w-full font-normal"
                id="bunker-input"
                onChange={(event) => setBunkerInput(event.target.value)}
                required
                value={bunkerInput}
              />
            </label>
            <Button disabled={!bunkerInput.trim()} size="sm" type="submit" variant="solid-fill">
              接続
            </Button>
          </form>
        )}
      </header>

      <div className="mx-auto grid max-w-[1440px] grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[240px_minmax(0,680px)_300px]">
        <aside
          className="hidden border-r border-solid-gray-300 px-4 py-6 lg:block"
          aria-label="メインナビゲーション"
        >
          <nav>
            <ul className="space-y-1">
              {navigation.map((item) => (
                <li key={item.to}>
                  <NavLink
                    aria-label={item.label}
                    className={({ isActive }) =>
                      `flex min-h-12 items-center gap-3 rounded-8 px-4 font-medium transition-colors focus-visible:outline focus-visible:outline-4 focus-visible:outline-black focus-visible:outline-offset-2 focus-visible:ring-2 focus-visible:ring-yellow-300 ${
                        isActive
                          ? "bg-key-50 text-key-1000"
                          : "text-solid-gray-800 hover:bg-solid-gray-50"
                      }`
                    }
                    end={item.end}
                    to={item.to}
                  >
                    <Icon name={item.icon} size={21} />
                    <span>{item.label}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <div className="mt-8 rounded-8 border border-solid-gray-300 p-4">
            <p className="font-bold">Nostrネットワーク</p>
            <p className="mt-2 text-sm leading-6 text-solid-gray-600">
              投稿やプロフィールは接続先のリレーに送られます。アプリのサーバーは経由しません。
            </p>
          </div>
        </aside>

        <main
          id="main"
          className="min-h-[calc(100vh-4rem)] border-solid-gray-300 pb-20 lg:border-r"
        >
          {notice && (
            <div
              className="flex items-start justify-between gap-4 border-b border-solid-gray-300 bg-key-50 px-4 py-3 text-sm text-solid-gray-900"
              role="status"
              aria-live="polite"
            >
              <p>{notice}</p>
              <button
                aria-label="通知を閉じる"
                className="rounded-4 p-1 focus-visible:outline focus-visible:outline-4 focus-visible:outline-black focus-visible:ring-2 focus-visible:ring-yellow-300"
                onClick={() => setNotice("")}
                type="button"
              >
                <Icon name="close" size={18} />
              </button>
            </div>
          )}
          <Outlet />
        </main>

        <aside className="hidden space-y-5 px-5 py-6 xl:block" aria-label="補助情報">
          <section className="rounded-8 border border-solid-gray-300 p-4">
            <h2 className="text-lg font-bold">接続先リレー</h2>
            <ul className="mt-3 space-y-2">
              {relays.read.map((relay) => (
                <li className="truncate text-sm text-solid-gray-700" key={relay} title={relay}>
                  <span
                    className="mr-2 inline-block h-2 w-2 rounded-full bg-solid-gray-420"
                    aria-hidden="true"
                  />
                  {new URL(relay).host}
                </li>
              ))}
            </ul>
            <NavLink
              className="mt-3 inline-block text-sm font-bold text-key-1000 underline"
              to="/settings"
            >
              リレー設定を確認
            </NavLink>
          </section>
          <section className="rounded-8 bg-solid-gray-50 p-4">
            <h2 className="font-bold">オープンなSNS</h2>
            <p className="mt-2 text-sm leading-6 text-solid-gray-700">
              Nostrは複数のリレーで動く分散型プロトコルです。接続先のリレーにはアクセス元のIPアドレスが伝わります。
            </p>
          </section>
          {pubkey && (
            <NavLink
              className="flex items-center gap-3 rounded-8 border border-solid-gray-300 p-3"
              to={`/profile/${pubkey}`}
            >
              <Avatar profile={profile} pubkey={pubkey} size="sm" />
              <span className="truncate font-bold">
                {profile.display_name || profile.name || "プロフィール"}
              </span>
            </NavLink>
          )}
        </aside>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-solid-gray-300 bg-white px-1 pb-[env(safe-area-inset-bottom)] lg:hidden"
        aria-label="メインナビゲーション"
      >
        {navigation.map((item) => (
          <NavLink
            aria-label={item.label}
            className={({ isActive }) =>
              `flex min-h-14 flex-col items-center justify-center gap-1 whitespace-nowrap px-1 text-sm focus-visible:outline focus-visible:outline-4 focus-visible:outline-black focus-visible:ring-2 focus-visible:ring-yellow-300 ${isActive ? "font-bold text-key-1000" : "text-solid-gray-700"}`
            }
            end={item.end}
            key={item.to}
            to={item.to}
          >
            <Icon name={item.icon} size={20} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
