export type PostContentPart = { text: string } | { image: string };

const IMAGE_PATH = /\.(?:avif|gif|jpe?g|png|webp)$/i;
const IMAGE_URL = /https:\/\/[^\s<>"']+/gi;
const TRAILING_PUNCTUATION = /[.,!?;:)\]}，。！？、）】」』]+$/u;

function imageSource(value: string): string | undefined {
  try {
    const url = new URL(value.replace(TRAILING_PUNCTUATION, ""));
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

// shortcut: only extension-addressed HTTPS images render; add media metadata detection for extensionless hosts.
export function splitPostContent(content: string): PostContentPart[] {
  const parts: PostContentPart[] = [];
  let cursor = 0;

  for (const match of content.matchAll(IMAGE_URL)) {
    const source = imageSource(match[0]);
    if (!source || match.index === undefined) continue;

    const matchEnd = match.index + match[0].length;
    const punctuation = match[0].match(TRAILING_PUNCTUATION)?.[0] ?? "";
    const imageEnd = matchEnd - punctuation.length;
    if (match.index > cursor) parts.push({ text: content.slice(cursor, match.index) });
    parts.push({ image: source });
    cursor = imageEnd;
  }

  if (cursor < content.length) parts.push({ text: content.slice(cursor) });
  return parts.length ? parts : [{ text: content }];
}
