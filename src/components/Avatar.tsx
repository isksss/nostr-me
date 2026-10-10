import type { Profile } from "../lib/nostr";

function imageSource(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export function Avatar({
  profile,
  pubkey,
  size = "md",
}: {
  profile?: Profile;
  pubkey: string;
  size?: "sm" | "md" | "lg";
}) {
  const name = profile?.display_name || profile?.name || pubkey;
  const picture = imageSource(profile?.picture);
  const sizeClass = {
    sm: "h-9 w-9 text-sm",
    md: "h-11 w-11 text-base",
    lg: "h-24 w-24 text-3xl",
  }[size];

  return picture ? (
    <img
      src={picture}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      className={`${sizeClass} shrink-0 rounded-full bg-solid-gray-100 object-cover`}
    />
  ) : (
    <span
      aria-hidden="true"
      className={`${sizeClass} flex shrink-0 items-center justify-center rounded-full bg-key-100 font-bold text-key-1000`}
    >
      {Array.from(name.trim())[0]?.toUpperCase() ?? "N"}
    </span>
  );
}
