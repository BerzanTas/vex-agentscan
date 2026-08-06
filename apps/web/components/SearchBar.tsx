"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { fetchLookup } from "../lib/api";

export type SearchVariant = "hero" | "compact";

const NO_MATCH_MESSAGE = "No matching activity";

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

export function SearchBar({ variant = "hero" }: { variant?: SearchVariant }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [noMatch, setNoMatch] = useState(false);
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

  const submitSearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = inputRef.current?.value.trim() ?? "";
    if (query === "" || searching) return;
    setSearching(true);
    const found = await fetchLookup(query);
    setSearching(false);
    if (found === null) {
      setNoMatch(true);
      return;
    }
    setNoMatch(false);
    router.push(`/tx/${encodeURIComponent(found.publicId)}`);
  };

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
          onChange={() => setNoMatch(false)}
          className="search-compact-input"
        />
        {noMatch && (
          <span role="status" className="search-compact-note">
            {NO_MATCH_MESSAGE}
          </span>
        )}
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
          onChange={() => setNoMatch(false)}
          className="search-input"
        />
        <button type="submit" className="cobalt-button">
          Search
        </button>
      </div>
      {noMatch && <p className="text-left text-sm text-warning">{NO_MATCH_MESSAGE}</p>}
    </form>
  );
}
