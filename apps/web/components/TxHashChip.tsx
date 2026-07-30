"use client";

import { useState } from "react";

function truncatedHash(hash: string): string {
  if (hash.length <= 12) return hash;
  return `${hash.slice(0, 6)}…${hash.slice(-4)}`;
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 14 14" className="h-3.5 w-3.5" aria-hidden="true">
      <rect
        x="4.5"
        y="4.5"
        width="7"
        height="7"
        rx="1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path
        d="M9.5 4.5v-1a1 1 0 0 0-1-1h-5a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1h1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  );
}

function CopiedIcon() {
  return (
    <svg viewBox="0 0 14 14" className="h-3.5 w-3.5 text-success" aria-hidden="true">
      <path
        d="M3 7.5 6 10.5 11 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ExplorerIcon() {
  return (
    <svg viewBox="0 0 14 14" className="h-3.5 w-3.5" aria-hidden="true">
      <path
        d="M6 3H4a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V8M8.5 3H11v2.5M11 3 6.5 7.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function TxHashChip({ txHash, explorerUrl }: { txHash: string; explorerUrl: string | null }) {
  const [copied, setCopied] = useState(false);

  const copyHash = async () => {
    await navigator.clipboard.writeText(txHash);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <span className="hash-chip">
      <span className="font-mono text-text-primary" title={txHash}>
        {truncatedHash(txHash)}
      </span>
      <button
        type="button"
        onClick={copyHash}
        aria-label="Copy transaction hash"
        className="hash-chip-copy"
      >
        {copied ? <CopiedIcon /> : <CopyIcon />}
      </button>
      {explorerUrl !== null && (
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener"
          aria-label="Open in explorer"
          className="text-accent hover:text-text-primary"
        >
          <ExplorerIcon />
        </a>
      )}
    </span>
  );
}
