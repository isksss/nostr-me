import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import type { Event } from "nostr-tools";
import { PostCard } from "../components/PostCard";
import { useNostr } from "../context/NostrContext";
import { decodeNostrIdentifier, readVisibleEvents } from "../lib/nostr";

export function EventPage() {
  const { identifier = "" } = useParams();
  const { relays } = useNostr();
  const [event, setEvent] = useState<Event>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let current = true;
    const decoded = decodeNostrIdentifier(identifier);
    const filter =
      decoded?.type === "event"
        ? { ids: [decoded.id] }
        : decoded?.type === "address"
          ? { authors: [decoded.pubkey], kinds: [decoded.kind], "#d": [decoded.identifier] }
          : /^[0-9a-f]{64}$/i.test(identifier)
            ? { ids: [identifier] }
            : undefined;
    if (!filter) {
      setEvent(undefined);
      setLoading(false);
      return;
    }
    setLoading(true);
    void readVisibleEvents(relays.read, filter)
      .then((events) => current && setEvent(events[0]))
      .catch(() => current && setEvent(undefined))
      .finally(() => current && setLoading(false));
    return () => {
      current = false;
    };
  }, [identifier, relays.read]);

  return (
    <>
      <header className="border-b border-solid-gray-300 px-4 py-5 sm:px-6">
        <h1 className="text-2xl font-bold">投稿</h1>
      </header>
      {event ? (
        <PostCard event={event} full />
      ) : (
        <p className="px-6 py-12 text-center text-solid-gray-700" role="status">
          {loading ? "投稿を読み込み中です" : "投稿が見つかりません。"}
        </p>
      )}
    </>
  );
}
