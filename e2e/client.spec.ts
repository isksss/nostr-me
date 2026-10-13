import { expect, test, type Page } from "@playwright/test";
import type { Event, Filter } from "nostr-tools";
import { finalizeEvent, generateSecretKey } from "nostr-tools/pure";

const relayPost: Event = {
  kind: 1,
  created_at: 1_700_000_000,
  tags: [],
  content: "E2E post: browser timeline works",
  pubkey: "1b84c5567b126440995d3ed5aaba0565d71e1834604819ff9c17f5e9d5dd078f",
  id: "f7478ea8459b5e24609ea828cdaa7c77ee6cba405743c3bc43b2c279c45d71b4",
  sig: "27261a41c3a03707f3db17f860e5764d69b078b29f0b63fb3796bde9d66a793cb9375612653dd11424e58623c6033565c1ed44ff3214f0c53d1c24448d8e9f3f",
};

function matchesFilter(filter: Filter, event: Event): boolean {
  return (
    (!filter.kinds || filter.kinds.includes(event.kind)) &&
    (!filter.authors || filter.authors.includes(event.pubkey)) &&
    (!filter.search || event.content.toLowerCase().includes(filter.search.toLowerCase())) &&
    (!filter["#p"] || event.tags.some((tag) => tag[0] === "p" && filter["#p"]?.includes(tag[1])))
  );
}

async function mockRelays(page: Page, posts: Event[] = [relayPost]) {
  await page.routeWebSocket(/^wss:\/\/[^/]+/, (socket) => {
    socket.onMessage((message) => {
      const request: unknown = JSON.parse(message.toString());
      if (!Array.isArray(request) || request[0] !== "REQ" || typeof request[1] !== "string") return;

      const subscriptionId = request[1];
      const filters = request.slice(2) as Filter[];
      for (const post of posts) {
        if (filters.some((filter) => matchesFilter(filter, post))) {
          socket.send(JSON.stringify(["EVENT", subscriptionId, post]));
        }
      }
      socket.send(JSON.stringify(["EOSE", subscriptionId]));
    });
  });
}

test("reads the public timeline, searches, and handles a missing signer", async ({ page }) => {
  await mockRelays(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "ホーム" })).toBeVisible();
  await expect(page.getByText(relayPost.content, { exact: true })).toBeVisible();
  await expect(page.getByRole("group", { name: "リアクション数" })).toContainText(
    "リアクションなし",
  );
  await expect(page.getByRole("button", { name: "👍でリアクション" })).toBeDisabled();

  await page.getByRole("link", { name: "検索" }).click();
  await page.getByLabel("ユーザー・投稿を検索").fill("browser timeline works");
  await page.getByRole("button", { name: "検索", exact: true }).click();
  await expect(page.getByText(relayPost.content, { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "NIP-07で接続" }).click();
  await expect(page.getByRole("status")).toContainText(
    "NIP-07対応の署名拡張をインストールしてください",
  );
});

test("validates and persists browser relay settings", async ({ page }) => {
  await mockRelays(page);
  await page.goto("/settings");

  const readRelays = page.getByLabel("読み込み用リレー（1行に1つ）");
  await readRelays.fill("https://insecure.example");
  await page.getByRole("button", { name: "リレー設定を保存" }).click();
  await expect(page.getByRole("alert")).toContainText("リレーURLにはwss://を指定してください。");

  await readRelays.fill("wss://e2e-read.example");
  await page.getByRole("button", { name: "リレー設定を保存" }).click();
  await expect(page.getByRole("status")).toContainText("リレー設定を更新しました");

  await page.reload();
  await expect(page.getByLabel("読み込み用リレー（1行に1つ）")).toHaveValue(
    "wss://e2e-read.example",
  );
});

test("opens NIP-46 sign-in and the new protocol pages", async ({ page }) => {
  await mockRelays(page);
  await page.goto("/");
  await page.getByRole("button", { name: "NIP-46", exact: true }).click();
  await expect(page.getByLabel("NIP-46接続先（bunker:// URLまたはNIP-05）")).toBeVisible();

  await page.getByRole("link", { name: "その他" }).click();
  await page.getByRole("link", { name: "長文記事" }).click();
  await expect(page.getByRole("heading", { name: "長文記事" })).toBeVisible();
  await page.getByRole("link", { name: "その他" }).click();
  await page.getByRole("link", { name: "ダイレクトメッセージ" }).click();
  await expect(page.getByRole("heading", { name: "ダイレクトメッセージ" })).toBeVisible();
});

test("renders HTTPS images inline in posts", async ({ page }) => {
  const post = finalizeEvent(
    {
      kind: 1,
      created_at: Math.floor(Date.now() / 1_000),
      tags: [],
      content: "Inline image: https://images.example/photo.png",
    },
    generateSecretKey(),
  );
  await mockRelays(page, [post]);
  await page.route("https://images.example/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL+WQAAAABJRU5ErkJggg==",
        "base64",
      ),
    }),
  );
  await page.goto("/");

  await expect(page.getByRole("img", { name: "投稿に添付された画像" })).toHaveAttribute(
    "src",
    "https://images.example/photo.png",
  );
});

test("renders X and Twitter status links as inline embeds", async ({ page }) => {
  const id = "1234567890123456789";
  const post = finalizeEvent(
    {
      kind: 1,
      created_at: Math.floor(Date.now() / 1_000),
      tags: [],
      content: `X post: https://x.com/example/status/${id}`,
    },
    generateSecretKey(),
  );
  await mockRelays(page, [post]);
  await page.route("https://platform.twitter.com/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<script>parent.postMessage({"twttr.embed":{"method":"twttr.private.resize","params":[{"height":321}]}},"*")</script>`,
    }),
  );
  await page.goto("/");

  const embed = page.getByTitle("Xの投稿");
  await expect(embed).toHaveAttribute(
    "src",
    `https://platform.twitter.com/embed/Tweet.html?id=${id}&lang=ja&dnt=true`,
  );
  await expect(embed).toHaveAttribute("height", "321");
  await expect(page.getByRole("link", { name: "Xで投稿を開く（別タブ）" })).toHaveAttribute(
    "href",
    `https://x.com/i/status/${id}`,
  );
});

test("keeps the mobile navigation usable", async ({ page }) => {
  await mockRelays(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const navigation = page.getByRole("navigation", { name: "メインナビゲーション" });
  await expect(navigation).toBeVisible();
  await navigation.getByRole("link", { name: "設定" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole("heading", { name: "設定" })).toBeVisible();
});
