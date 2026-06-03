"use client";

import { useEffect, useState, useTransition } from "react";
import { Bookmark, BookmarkCheck } from "lucide-react";

import {
  getSavedArticleState,
  setSavedArticleState,
} from "@/lib/actions/saved-articles";
import { Button } from "@/components/ui/button";

export function SaveArticleButton({ newsItemId }: { newsItemId: string }) {
  const [saved, setSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setMessage(null);

    getSavedArticleState(newsItemId)
      .then((value) => {
        if (!cancelled) setSaved(value);
      })
      .catch(() => {
        if (!cancelled) setSaved(false);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [newsItemId]);

  function toggle() {
    const next = !saved;
    setMessage(null);
    setSaved(next);
    startTransition(async () => {
      const result = await setSavedArticleState(newsItemId, next);
      if (!result.ok) {
        setSaved(!next);
        setMessage(result.error);
        return;
      }
      setSaved(result.saved);
    });
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="secondary"
        onClick={toggle}
        disabled={!loaded || isPending}
      >
        {saved ? (
          <BookmarkCheck className="mr-2 h-4 w-4" />
        ) : (
          <Bookmark className="mr-2 h-4 w-4" />
        )}
        {saved ? "Saved" : "Save article"}
      </Button>
      {message ? <p className="text-xs text-amber-300">{message}</p> : null}
    </div>
  );
}
