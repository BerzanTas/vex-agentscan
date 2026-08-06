import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StatusTimeline } from "../StatusTimeline";

type TimelineSource = {
  clientCreatedAt: string;
  clientConfirmedAt: string | null;
  status: string;
  verificationState: string;
};

const confirmedAndVerified: TimelineSource = {
  clientCreatedAt: "2026-08-06T10:00:00.000Z",
  clientConfirmedAt: "2026-08-06T10:00:12.000Z",
  status: "confirmed",
  verificationState: "verified_full",
};

function markupFor(source: TimelineSource): string {
  return renderToStaticMarkup(createElement(StatusTimeline, { source }));
}

describe("StatusTimeline", () => {
  it("marks every step for the cascade reveal", () => {
    const markup = markupFor(confirmedAndVerified);

    expect(markup.match(/timeline-step/g)).toHaveLength(3);
  });

  it("carries the cascade class on the step elements themselves", () => {
    const markup = markupFor(confirmedAndVerified);

    expect(markup.match(/<li class="timeline-step /g)).toHaveLength(3);
  });

  it("renders the panel as glass instead of a card", () => {
    const markup = markupFor(confirmedAndVerified);

    expect(markup).toContain('<ol class="glass ');
    expect(markup).not.toContain("card-hover");
  });

  it("lights the dot of a reached step", () => {
    const markup = markupFor(confirmedAndVerified);

    expect(markup.match(/timeline-dot-reached/g)).toHaveLength(3);
  });

  it("leaves the dots of unreached steps unlit", () => {
    const markup = markupFor({
      clientCreatedAt: "2026-08-06T10:00:00.000Z",
      clientConfirmedAt: null,
      status: "pending",
      verificationState: "queued",
    });

    expect(markup.match(/timeline-dot-reached/g)).toHaveLength(1);
    expect(markup).toContain("Pending");
    expect(markup).toContain("Verification queued");
  });
});
