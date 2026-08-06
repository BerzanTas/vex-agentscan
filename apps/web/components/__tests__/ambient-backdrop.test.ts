import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AmbientBackdrop } from "../AmbientBackdrop";

function markup(): string {
  return renderToStaticMarkup(createElement(AmbientBackdrop));
}

describe("AmbientBackdrop", () => {
  it("renders three drifting aurora layers", () => {
    expect(markup().match(/class="ambient-aurora ambient-aurora-\w+"/g)).toHaveLength(3);
  });

  it("renders the receding horizon grid", () => {
    expect(markup()).toContain('class="ambient-horizon"');
  });

  it("renders the dot texture layer", () => {
    expect(markup()).toContain('class="ambient-grid"');
  });

  it("renders the shimmer layer", () => {
    expect(markup()).toContain('class="ambient-shimmer"');
  });

  it("renders the grain texture from an inline filter the production CSP allows", () => {
    expect(markup()).toContain("feTurbulence");
    expect(markup()).not.toContain("data:image");
  });

  it("renders the edge vignette", () => {
    expect(markup()).toContain('class="ambient-vignette"');
  });

  it("hides the whole backdrop from assistive technology", () => {
    expect(markup().match(/aria-hidden="true"/g)).toHaveLength(1);
  });

  it("carries no inline style attribute the production CSP would block", () => {
    expect(markup()).not.toContain("style=");
  });
});
