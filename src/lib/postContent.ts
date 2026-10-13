export type PostContentPart =
  | { text: string }
  | { image: string }
  | { xPost: { id: string; url: string } };

const IMAGE_PATH = /\.(?:avif|gif|jpe?g|png|webp)$/i;
const CONTENT_URL = /https?:\/\/[^\s<>"']+/gi;
const TRAILING_PUNCTUATION = /[.,!?;:)\]}，。！？、）】」』]+$/u;
const X_HOSTS = new Set([
  "x.com",
  "www.x.com",
  "twitter.com",
  "www.twitter.com",
  "mobile.twitter.com",
]);

function imageSource(value: string): string | undefined {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      IMAGE_PATH.test(url.pathname)
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

function xPostSource(value: string): { id: string; url: string } | undefined {
  try {
    const url = new URL(value);
    const id = url.pathname.match(/\/status\/(\d{1,30})(?:\/|$)/i)?.[1];
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      X_HOSTS.has(url.hostname.toLowerCase()) &&
      id
      ? { id, url: `https://x.com/i/status/${id}` }
      : undefined;
  } catch {
    return undefined;
  }
}

// shortcut: images need extensions and X links must be direct status URLs; add metadata and t.co support if needed.
export function splitPostContent(content: string): PostContentPart[] {
  const parts: PostContentPart[] = [];
  let cursor = 0;

  for (const match of content.matchAll(CONTENT_URL)) {
    const url = match[0].replace(TRAILING_PUNCTUATION, "");
    const image = imageSource(url);
    const xPost = image ? undefined : xPostSource(url);
    const part = image ? { image } : xPost ? { xPost } : undefined;
    if (!part || match.index === undefined) continue;

    if (match.index > cursor) parts.push({ text: content.slice(cursor, match.index) });
    parts.push(part);
    cursor = match.index + url.length;
  }

  if (cursor < content.length) parts.push({ text: content.slice(cursor) });
  return parts.length ? parts : [{ text: content }];
}
