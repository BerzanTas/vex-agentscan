"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { fetchLookup } from "../lib/api";

export type SearchVariant = "hero" | "compact";

export const NO_MATCH_PRIMARY = "NO MATCH";
export const NO_MATCH_SECONDARY = "Nothing indexed for that hash or activity id";

export type SearchFeedback = { noMatch: boolean; missCount: number };

export type SearchSignal = "miss" | "found" | "typing";

export const IDLE_SEARCH_FEEDBACK: SearchFeedback = { noMatch: false, missCount: 0 };

export function nextSearchFeedback(current: SearchFeedback, signal: SearchSignal): SearchFeedback {
  if (signal === "miss") return { noMatch: true, missCount: current.missCount + 1 };
  if (signal === "found") return IDLE_SEARCH_FEEDBACK;
  return { noMatch: false, missCount: current.missCount };
}

export function missShakePhase(feedback: SearchFeedback): "a" | "b" | undefined {
  if (!feedback.noMatch) return undefined;
  if (feedback.missCount % 2 === 1) return "a";
  return "b";
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
}

function MagnifierIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="6" cy="6" r="4.25" />
      <line x1="9.2" y1="9.2" x2="12.5" y2="12.5" />
    </svg>
  );
}

function MissGlyph() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="7" cy="7" r="5.2" />
      <line x1="3.3" y1="10.7" x2="10.7" y2="3.3" />
    </svg>
  );
}

function NoMatchReadout() {
  return (
    <div className="search-readout">
      <span className="search-readout-glyph">
        <MissGlyph />
      </span>
      <span className="search-readout-lines">
        <span className="search-readout-primary">{NO_MATCH_PRIMARY}</span>
        <span className="search-readout-secondary">{NO_MATCH_SECONDARY}</span>
      </span>
    </div>
  );
}

export function SearchBar({ variant = "hero" }: { variant?: SearchVariant }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [feedback, setFeedback] = useState(IDLE_SEARCH_FEEDBACK);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const focusOnSlash = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      event.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener("keydown", focusOnSlash);
    return () => window.removeEventListener("keydown", focusOnSlash);
  }, []);

  const clearOnTyping = () => setFeedback((current) => nextSearchFeedback(current, "typing"));

  const submitSearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = inputRef.current?.value.trim() ?? "";
    if (query === "" || searching) return;
    setSearching(true);
    const found = await fetchLookup(query);
    setSearching(false);
    if (found === null) {
      setFeedback((current) => nextSearchFeedback(current, "miss"));
      inputRef.current?.focus();
      return;
    }
    setFeedback((current) => nextSearchFeedback(current, "found"));
    router.push(`/tx/${encodeURIComponent(found.publicId)}`);
  };

  const scanning = searching || undefined;
  const missPhase = missShakePhase(feedback);

  if (variant === "compact") {
    return (
      <form onSubmit={submitSearch} className="search-compact">
        <span className="search-compact-icon">
          <MagnifierIcon />
        </span>
        <input
          ref={inputRef}
          type="text"
          name="q"
          placeholder="Search hash / id"
          aria-label="Search by transaction hash or activity id"
          spellCheck={false}
          autoComplete="off"
          onChange={clearOnTyping}
          className="search-compact-input"
          data-scanning={scanning}
          data-miss={missPhase}
        />
        <div role="status" className="search-compact-readout">
          {feedback.noMatch && <NoMatchReadout key={feedback.missCount} />}
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={submitSearch} className="flex w-full max-w-xl flex-col gap-2">
      <div className="flex gap-2">
        <input
          ref={inputRef}
          type="text"
          name="q"
          placeholder="Search by tx hash / activity id"
          spellCheck={false}
          autoComplete="off"
          onChange={clearOnTyping}
          className="search-input"
          data-scanning={scanning}
          data-miss={missPhase}
        />
        <button type="submit" className="cobalt-button">
          Search
        </button>
      </div>
      <div role="status" className="search-readout-slot">
        {feedback.noMatch && <NoMatchReadout key={feedback.missCount} />}
      </div>
    </form>
  );
}
