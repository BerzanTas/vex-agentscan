import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AmbientBackdrop } from "../AmbientBackdrop";

function markup(): string {
  return renderToStaticMarkup(createElement(AmbientBackdrop));
}

describe("AmbientBackdrop", () => {
  it("renders the fog layer", () => {
    expect(markup()).toContain('class="ambient-fog"');
  });

  it("renders the dot grid layer", () => {
    expect(markup()).toContain('class="ambient-grid"');
  });

  it("renders the beam layer", () => {
    expect(markup()).toContain('class="ambient-beam"');
  });

  it("hides the whole backdrop from assistive technology", () => {
    expect(markup().match(/aria-hidden="true"/g)).toHaveLength(1);
  });

  it("carries no inline style attribute the production CSP would block", () => {
    expect(markup()).not.toContain("style=");
  });
});
