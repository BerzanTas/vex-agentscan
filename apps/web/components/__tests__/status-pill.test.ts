import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StatusPill } from "../StatusPill";

function markupFor(status: string): string {
  return renderToStaticMarkup(createElement(StatusPill, { status }));
}

describe("StatusPill", () => {
  it("renders a definitively failed activity in the failed palette", () => {
    expect(markupFor("definitively_failed")).toContain('class="status-pill status-pill-failed"');
  });

  it("renders a superseded activity in its own neutral palette", () => {
    expect(markupFor("superseded_unproven")).toContain('class="status-pill status-pill-unproven"');
  });

  it("never renders a superseded activity in the failed palette", () => {
    expect(markupFor("superseded_unproven")).not.toContain("status-pill-failed");
  });

  it("labels a superseded activity by its unproven inclusion rather than by failure", () => {
    const markup = markupFor("superseded_unproven");

    expect(markup).toContain("inclusion unproven");
    expect(markup).not.toContain("failed");
    expect(markup).not.toContain("superseded");
  });
});
