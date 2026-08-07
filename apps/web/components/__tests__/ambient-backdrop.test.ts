import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AmbientBackdrop,
  cometTrailPath,
  cometTrails,
  latticeEdges,
  latticeNodes,
  latticePulseRoutes,
  latticeRoutePath,
  latticeViewBox,
  starfieldStars,
} from "../AmbientBackdrop";

function markup(): string {
  return renderToStaticMarkup(createElement(AmbientBackdrop));
}

const HERO_CALM_ZONE = { minX: 400, maxX: 1040, maxY: 400 };

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

  it("renders the lattice above the dot texture and below the shimmer", () => {
    const rendered = markup();
    const grid = rendered.indexOf('class="ambient-grid"');
    const lattice = rendered.indexOf('class="ambient-lattice"');
    const shimmer = rendered.indexOf('class="ambient-shimmer"');
    expect(grid).toBeLessThan(lattice);
    expect(lattice).toBeLessThan(shimmer);
  });

  it("renders the starfield behind the horizon and the comets over the lattice", () => {
    const rendered = markup();
    const starfield = rendered.indexOf('class="ambient-starfield"');
    const horizon = rendered.indexOf('class="ambient-horizon"');
    const lattice = rendered.indexOf('class="ambient-lattice"');
    const comets = rendered.indexOf('class="ambient-comets"');
    const shimmer = rendered.indexOf('class="ambient-shimmer"');
    expect(starfield).toBeLessThan(horizon);
    expect(lattice).toBeLessThan(comets);
    expect(comets).toBeLessThan(shimmer);
  });

  it("renders identical markup on every render", () => {
    expect(markup()).toBe(markup());
  });

  it("keeps the lattice within the 24 to 40 node budget", () => {
    expect(latticeNodes).toHaveLength(34);
  });

  it("renders one circle per lattice node and star", () => {
    expect(markup().match(/<circle /g)).toHaveLength(latticeNodes.length + starfieldStars.length);
  });

  it("renders one line per lattice edge", () => {
    expect(markup().match(/<line /g)).toHaveLength(latticeEdges.length);
  });

  it("rides four data pulses along the lattice", () => {
    expect(latticePulseRoutes).toHaveLength(4);
    expect(markup().match(/class="ambient-lattice-pulse"/g)).toHaveLength(4);
  });

  it("normalizes every traveling streak to a shared path length", () => {
    expect(markup().match(/pathLength="100"/g)).toHaveLength(
      latticePulseRoutes.length + cometTrails.length * 2,
    );
  });

  it("keeps the comet fleet at six streaks total", () => {
    expect(latticePulseRoutes.length + cometTrails.length).toBe(6);
  });

  it("renders a tail and a head for every free comet", () => {
    expect(markup().match(/class="ambient-comet-tail"/g)).toHaveLength(cometTrails.length);
    expect(markup().match(/class="ambient-comet-head"/g)).toHaveLength(cometTrails.length);
  });

  it("keeps every comet trail inside the viewbox", () => {
    const outside = cometTrails.filter(
      (trail) =>
        [trail.from, trail.to].filter(
          (point) =>
            point.x < 0 ||
            point.x > latticeViewBox.width ||
            point.y < 0 ||
            point.y > latticeViewBox.height,
        ).length > 0,
    );
    expect(outside).toEqual([]);
  });

  it("flies free comets on long diagonals instead of lattice hops", () => {
    const short = cometTrails.filter(
      (trail) => Math.hypot(trail.to.x - trail.from.x, trail.to.y - trail.from.y) < 800,
    );
    expect(short).toEqual([]);
  });

  it("keeps every lattice node inside the viewbox", () => {
    const outside = latticeNodes.filter(
      (node) =>
        node.x < 0 || node.x > latticeViewBox.width || node.y < 0 || node.y > latticeViewBox.height,
    );
    expect(outside).toEqual([]);
  });

  it("keeps the hero calm zone free of lattice nodes", () => {
    const intruders = latticeNodes.filter(
      (node) =>
        node.x >= HERO_CALM_ZONE.minX &&
        node.x <= HERO_CALM_ZONE.maxX &&
        node.y <= HERO_CALM_ZONE.maxY,
    );
    expect(intruders).toEqual([]);
  });

  it("keeps lattice node radii small enough to stay ambient", () => {
    const oversized = latticeNodes.filter((node) => node.r < 2 || node.r > 3.5);
    expect(oversized).toEqual([]);
  });

  it("connects every edge to declared nodes", () => {
    const dangling = latticeEdges.filter(
      ([from, to]) =>
        from < 0 || from >= latticeNodes.length || to < 0 || to >= latticeNodes.length,
    );
    expect(dangling).toEqual([]);
  });

  it("routes every data pulse along declared edges", () => {
    const declared = new Set(latticeEdges.map(([from, to]) => `${Math.min(from, to)}-${Math.max(from, to)}`));
    const offGrid = latticePulseRoutes.flatMap((route) =>
      route
        .slice(1)
        .map((to, position) => `${Math.min(route[position] ?? -1, to)}-${Math.max(route[position] ?? -1, to)}`)
        .filter((segment) => !declared.has(segment)),
    );
    expect(offGrid).toEqual([]);
  });

  it("builds a pulse path that starts at its first node", () => {
    expect(latticeRoutePath([0, 1])).toBe("M 60 130 L 150 210");
  });

  it("builds a comet path from its trail endpoints", () => {
    expect(cometTrailPath({ from: { x: 120, y: 40 }, to: { x: 980, y: 470 } })).toBe(
      "M 120 40 L 980 470",
    );
  });

  it("keeps the starfield within its sparse budget", () => {
    expect(starfieldStars).toHaveLength(44);
  });

  it("keeps every star inside the viewbox", () => {
    const outside = starfieldStars.filter(
      (star) =>
        star.x < 0 || star.x > latticeViewBox.width || star.y < 0 || star.y > latticeViewBox.height,
    );
    expect(outside).toEqual([]);
  });

  it("draws stars in exactly three sizes", () => {
    expect([...new Set(starfieldStars.map((star) => star.r))].sort()).toEqual([0.7, 1.1, 1.6]);
  });

  it("limits twinkle to a handful of stars", () => {
    expect(starfieldStars.filter((star) => star.twinkle)).toHaveLength(7);
  });
});
