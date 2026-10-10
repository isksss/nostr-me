import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import type { Event } from "nostr-tools";
import { Avatar } from "../components/Avatar";
import { PostCard } from "../components/PostCard";
import { Button } from "../components/dads/Button/Button";
import { Input } from "../components/dads/Input/Input";
import { Label } from "../components/dads/Label/Label";
import { Textarea } from "../components/dads/Textarea/Textarea";
import { useNostr } from "../context/NostrContext";
import { publicKeyLabel, readProfile, readTimeline, type Profile } from "../lib/nostr";

export function ProfilePage() {
  const { pubkey: routePubkey } = useParams();
  const {
    pubkey,
    profile: ownProfile,
    profiles,
    relays,
    following,
    connect,
    follow,
    updateProfile,
    setNotice,
  } = useNostr();
  const target = (routePubkey ?? pubkey ?? "").toLowerCase();
  const isOwn = Boolean(pubkey && target === pubkey);
  const [profile, setProfile] = useState<Profile>({});
  const [posts, setPosts] = useState<Event[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Profile>({});

  useEffect(() => {
    if (!/^[0-9a-f]{64}$/i.test(target)) return;
    let current = true;
    setLoading(true);
    Promise.all([
      isOwn ? Promise.resolve(ownProfile) : readProfile(target, relays.read),
      readTimeline(relays.read, [target]),
    ])
      .then(([nextProfile, nextPosts]) => {
        if (!current) return;
        setProfile(nextProfile);
        setForm(nextProfile);
        setPosts(nextPosts);
      })
      .catch(() => setNotice("プロフィールを読み込めませんでした。"))
      .finally(() => current && setLoading(false));
    return () => {
      current = false;
    };
  }, [isOwn, ownProfile, relays.read, setNotice, target]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await updateProfile({
        ...form,
        name: form.name?.trim() || undefined,
        display_name: form.display_name?.trim() || undefined,
        about: form.about?.trim() || undefined,
        picture: form.picture?.trim() || undefined,
        nip05: form.nip05?.trim() || undefined,
      });
      setProfile(form);
      setEditing(false);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "プロフィールを保存できませんでした。");
    }
  }

  if (!target) {
    return (
      <section className="px-6 py-12 text-center">
        <h1 className="text-2xl font-bold">プロフィール</h1>
        <p className="mt-2 text-solid-gray-700">
          公開プロフィールを見るにはNIP-07署名拡張に接続してください。
        </p>
        <Button className="mt-4" onClick={() => void connect()} size="sm" variant="solid-fill">
          署名拡張に接続
        </Button>
      </section>
    );
  }
  if (!/^[0-9a-f]{64}$/i.test(target)) {
    return (
      <p className="px-6 py-12 text-center text-solid-gray-700">公開鍵の形式が正しくありません。</p>
    );
  }

  const displayProfile = isOwn ? ownProfile : (profiles[target] ?? profile);
  const followingTarget = following.includes(target);
  let website: string | undefined;
  try {
    const url = new URL(displayProfile.website ?? "");
    if (["https:", "http:"].includes(url.protocol) && !url.username && !url.password)
      website = url.href;
  } catch {
    website = undefined;
  }

  async function toggleFollow() {
    try {
      await follow(target, !followingTarget);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "フォローを変更できませんでした。");
    }
  }

  return (
    <>
      <header className="border-b border-solid-gray-300 px-4 py-5 sm:px-6">
        <h1 className="text-2xl font-bold">プロフィール</h1>
        <p className="mt-1 break-all text-sm text-solid-gray-600">{publicKeyLabel(target)}</p>
      </header>
      <section
        className="border-b border-solid-gray-300 px-4 py-6 sm:px-6"
        aria-label="プロフィール情報"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <Avatar profile={displayProfile} pubkey={target} size="lg" />
          {isOwn ? (
            <Button onClick={() => setEditing((value) => !value)} size="sm" variant="outline">
              {editing ? "編集を閉じる" : "プロフィールを編集"}
            </Button>
          ) : pubkey ? (
            <Button
              onClick={() => void toggleFollow()}
              size="sm"
              variant={followingTarget ? "outline" : "solid-fill"}
            >
              {followingTarget ? "フォロー中" : "フォローする"}
            </Button>
          ) : (
            <Button onClick={() => void connect()} size="sm" variant="outline">
              接続してフォロー
            </Button>
          )}
        </div>
        <h2 className="mt-4 text-xl font-bold">
          {displayProfile.display_name || displayProfile.name || "名前未設定"}
        </h2>
        {displayProfile.name &&
          displayProfile.display_name &&
          displayProfile.name !== displayProfile.display_name && (
            <p className="text-sm text-solid-gray-600">@{displayProfile.name}</p>
          )}
        {displayProfile.nip05 && (
          <p className="mt-2 text-sm text-solid-gray-600">NIP-05: {displayProfile.nip05}</p>
        )}
        {displayProfile.about && (
          <p className="mt-3 whitespace-pre-wrap break-words leading-7">{displayProfile.about}</p>
        )}
        {website && (
          <a
            className="mt-3 inline-block break-all text-key-1000 underline"
            href={website}
            rel="noreferrer"
            target="_blank"
          >
            {website}
          </a>
        )}
      </section>

      {editing && isOwn && (
        <form
          className="space-y-4 border-b border-solid-gray-300 p-4 sm:p-6"
          onSubmit={saveProfile}
        >
          <div>
            <Label className="mb-2 block" htmlFor="display-name">
              表示名
            </Label>
            <Input
              id="display-name"
              maxLength={128}
              onChange={(event) => setForm({ ...form, display_name: event.target.value })}
              value={form.display_name ?? ""}
            />
          </div>
          <div>
            <Label className="mb-2 block" htmlFor="user-name">
              名前
            </Label>
            <Input
              id="user-name"
              maxLength={128}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              value={form.name ?? ""}
            />
          </div>
          <div>
            <Label className="mb-2 block" htmlFor="nip05">
              NIP-05 ID
            </Label>
            <Input
              aria-describedby="nip05-help"
              autoCapitalize="none"
              autoCorrect="off"
              id="nip05"
              maxLength={256}
              onChange={(event) => setForm({ ...form, nip05: event.target.value })}
              spellCheck={false}
              type="text"
              value={form.nip05 ?? ""}
            />
            <p className="mt-2 text-sm leading-6 text-solid-gray-600" id="nip05-help">
              例: alice@example.com。ドメインの /.well-known/nostr.json?name=alice
              がこのアカウントの公開鍵を返すよう設定してください。CORSは
              Access-Control-Allow-Origin: * にします。入力しただけでは確認されません。
            </p>
          </div>
          <div>
            <Label className="mb-2 block" htmlFor="picture-url">
              画像URL（HTTPS）
            </Label>
            <Input
              id="picture-url"
              maxLength={2048}
              onChange={(event) => setForm({ ...form, picture: event.target.value })}
              type="url"
              value={form.picture ?? ""}
            />
          </div>
          <div>
            <Label className="mb-2 block" htmlFor="about">
              自己紹介
            </Label>
            <Textarea
              className="w-full"
              id="about"
              maxLength={5000}
              onChange={(event) => setForm({ ...form, about: event.target.value })}
              rows={4}
              value={form.about ?? ""}
            />
          </div>
          <div className="flex justify-end">
            <Button size="sm" type="submit" variant="solid-fill">
              変更を公開
            </Button>
          </div>
        </form>
      )}

      <h2 className="border-b border-solid-gray-300 px-4 py-4 text-lg font-bold sm:px-6">投稿</h2>
      {posts.length ? (
        posts.map((post) => <PostCard event={post} key={post.id} />)
      ) : (
        <p className="px-6 py-10 text-center text-solid-gray-700" role="status">
          {loading ? "読み込み中です" : "公開投稿はありません。"}
        </p>
      )}
    </>
  );
}
