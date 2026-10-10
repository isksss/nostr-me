# nostr.me

https://nostr-me.isksss.dev

Nostrの公開リレーへブラウザーから直接接続するReactクライアントです。アプリ用バックエンドや秘密鍵の保存機能はありません。

## 開発環境

- Node.js 22.23.3（mise）
- pnpm 12.10.1
- React 18 / TypeScript / Vite
- Tailwind CSS 4 + デジタル庁デザインシステムのテーマプラグイン・Reactコードスニペット
- OXC (`oxfmt`, `oxlint`), Vitest, Playwright

```sh
mise install
pnpm install --frozen-lockfile
pnpm dev
```

`http://localhost:5173`で開発版を確認できます。ブラウザーから初期リレーへ接続します。

## チェック

```sh
pnpm test                 # Vitest unit tests
pnpm test:e2e             # Run Chromium E2E tests with cf dev
pnpm test:all             # Both suites
pnpm typecheck
pnpm lint
pnpm fmt:check
pnpm build
```

For a fresh machine, install the Playwright browser once with `pnpm exec playwright install chromium`. E2E tests run against `cf dev` and use a signed fixture over mocked Nostr WebSockets, so they do not depend on public relay availability.

## Nostrの動作

- 初期リレー（read/write）: `wss://relay.damus.io`、`wss://nos.lol`、`wss://relay.primal.net`、日本語コミュニティの`wss://yabu.me`
- アカウントにNIP-65リレー一覧があれば、そちらを優先します。設定済みNIP-65リレーにアプリ既定リレーを常時追加することはありません。
- NIP-07署名拡張またはNIP-46署名サーバーを接続すると投稿、返信、リアクション、リポスト、フォロー、プロフィール更新ができます。NIP-42認証が必要なリレーには接続中の署名者で認証します。
- NIP-17/44/59の暗号化DMを送受信でき、旧式NIP-04の送受信にも対応します。復号は署名拡張または署名サーバーに委ね、DM本文をアプリに保存しません。
- NIP-19の`npub`/`nprofile`/`note`/`nevent`/`naddr`を検索欄やプロフィール・投稿URLで解決します。NIP-05はプロフィール画面で検証します。
- NIP-23長文記事、NIP-51公開人物リスト、NIP-56報告、NIP-09削除リクエストに対応します。削除リクエストはリレー上の削除を保証しません。
- NIP-25リアクション数は投稿ごとに要求したとき取得します。NIP-50対応リレーでは投稿・プロフィールを検索し、対応していない場合は現在取得済みの投稿をローカル検索します。
- Zap（NIP-57）は実装していません。
- リレーにはアクセス元のIPアドレス等が伝わる場合があります。Webフォントやプロフィール画像は外部配信元から読み込みます。プロフィール画像はHTTPS URLのみ表示し、参照元ヘッダーを送信しません。

## DADSコードスニペット

Button、Input、Label、Slot、Textareaは[デジタル庁デザインシステム React版](https://design.digital.go.jp/dads/react/)のソースを必要な範囲で取り込み、Tailwind CSSテーマプラグインと組み合わせています。出典とMITライセンスは[`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md)を参照してください。

## Cloudflareへのデプロイ

環境のCloudflare `cf` CLI（0.15.0）を使用します。Cloudflare Viteプラグインはビルド出力生成のため`wrangler`パッケージにも依存しますが、デプロイには`cf`のみを使います。`isksss.dev`ゾーンへのアクセス権があるCloudflareアカウントで認証後、次を実行します。

```sh
cf auth whoami
cf deploy --dry-run
cf deploy
```

`cloudflare.config.ts`でWorker名、SPAフォールバック、`nostr-me.isksss.dev`のカスタムドメインを設定しています。ドメインのDNSとTLS有効化には、Cloudflareアカウントでゾーンを管理できることが必要です。

`cf` CLIは技術プレビュー版です。CLIや設定形式を更新する際は、デプロイ前に`cf deploy --dry-run`で確認してください。
