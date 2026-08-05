"use client";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <section className="flex flex-col items-center gap-4 px-6 py-16 text-center">
      <h1 className="font-serif text-3xl text-text-primary">Data is temporarily unavailable</h1>
      <p className="max-w-prose text-sm text-text-secondary">
        We could not reach the API. This is an outage on our side, not an absence of agent activity.
      </p>
      <button type="button" onClick={reset} className="text-sm underline">
        Try again
      </button>
    </section>
  );
}
