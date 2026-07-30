"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { fetchLookup } from "../lib/api";

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
}

export function SearchBar() {
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
      {noMatch && <p className="text-left text-sm text-warning">No matching activity</p>}
    </form>
  );
}
