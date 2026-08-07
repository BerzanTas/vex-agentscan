"use client";

import { PageHeading } from "../components/PageHeading";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <section className="flex flex-col gap-6 px-6 py-16">
      <PageHeading
        kicker="SYSTEM // STATUS"
        title="Data is temporarily unavailable"
        description="We could not reach the API. This is an outage on our side, not an absence of agent activity."
      />
      <button type="button" onClick={reset} className="self-start text-sm underline">
        Try again
      </button>
    </section>
  );
}
