export type LatticeNode = { readonly x: number; readonly y: number; readonly r: number };
export type LatticeEdge = readonly [number, number];
export type LatticeRoute = readonly number[];
export type StarfieldStar = {
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly twinkle: boolean;
};
export type CometTrail = {
  readonly from: { readonly x: number; readonly y: number };
  readonly to: { readonly x: number; readonly y: number };
};

export const latticeViewBox = { width: 1440, height: 900 } as const;

export const latticeNodes: readonly LatticeNode[] = [
  { x: 60, y: 130, r: 2.5 },
  { x: 150, y: 210, r: 3 },
  { x: 40, y: 320, r: 2 },
  { x: 210, y: 90, r: 2 },
  { x: 120, y: 430, r: 3 },
  { x: 250, y: 330, r: 2.5 },
  { x: 60, y: 560, r: 2 },
  { x: 190, y: 620, r: 3.5 },
  { x: 320, y: 500, r: 3 },
  { x: 90, y: 740, r: 2.5 },
  { x: 240, y: 810, r: 2 },
  { x: 370, y: 700, r: 2.5 },
  { x: 1380, y: 120, r: 2.5 },
  { x: 1290, y: 230, r: 3 },
  { x: 1400, y: 340, r: 2 },
  { x: 1190, y: 150, r: 2 },
  { x: 1330, y: 460, r: 3.5 },
  { x: 1220, y: 380, r: 3 },
  { x: 1390, y: 600, r: 2 },
  { x: 1260, y: 640, r: 3 },
  { x: 1150, y: 540, r: 2.5 },
  { x: 1350, y: 780, r: 2.5 },
  { x: 1200, y: 850, r: 2 },
  { x: 1080, y: 720, r: 3 },
  { x: 480, y: 640, r: 3 },
  { x: 600, y: 760, r: 2.5 },
  { x: 540, y: 870, r: 2 },
  { x: 720, y: 690, r: 3.5 },
  { x: 860, y: 800, r: 2.5 },
  { x: 780, y: 590, r: 2 },
  { x: 940, y: 660, r: 3 },
  { x: 1000, y: 850, r: 2 },
  { x: 420, y: 520, r: 2.5 },
  { x: 1040, y: 480, r: 2 },
];

export const latticeEdges: readonly LatticeEdge[] = [
  [0, 1],
  [1, 2],
  [1, 3],
  [1, 5],
  [2, 4],
  [4, 5],
  [4, 6],
  [5, 8],
  [6, 7],
  [7, 8],
  [7, 9],
  [8, 11],
  [8, 32],
  [9, 10],
  [10, 11],
  [11, 24],
  [24, 25],
  [25, 26],
  [25, 27],
  [27, 28],
  [27, 29],
  [28, 31],
  [29, 30],
  [30, 31],
  [30, 23],
  [32, 24],
  [12, 13],
  [12, 14],
  [13, 15],
  [13, 17],
  [14, 16],
  [16, 17],
  [16, 18],
  [17, 20],
  [18, 19],
  [19, 20],
  [19, 21],
  [20, 23],
  [20, 33],
  [21, 22],
  [22, 23],
  [23, 31],
  [33, 30],
];

export const latticePulseRoutes: readonly LatticeRoute[] = [
  [0, 1, 5, 8, 32],
  [12, 13, 17, 20, 33],
  [24, 25, 27, 29, 30],
  [6, 7, 9, 10, 11],
];

export const cometTrails: readonly CometTrail[] = [
  { from: { x: 120, y: 40 }, to: { x: 980, y: 470 } },
  { from: { x: 1400, y: 200 }, to: { x: 620, y: 760 } },
];

export const starfieldStars: readonly StarfieldStar[] = [
  { x: 70, y: 60, r: 1.1, twinkle: false },
  { x: 200, y: 150, r: 0.7, twinkle: false },
  { x: 340, y: 40, r: 1.6, twinkle: true },
  { x: 460, y: 120, r: 0.7, twinkle: false },
  { x: 585, y: 70, r: 1.1, twinkle: false },
  { x: 700, y: 30, r: 0.7, twinkle: false },
  { x: 830, y: 90, r: 1.6, twinkle: false },
  { x: 960, y: 50, r: 0.7, twinkle: true },
  { x: 1090, y: 110, r: 1.1, twinkle: false },
  { x: 1230, y: 45, r: 0.7, twinkle: false },
  { x: 1370, y: 95, r: 1.6, twinkle: false },
  { x: 130, y: 260, r: 0.7, twinkle: false },
  { x: 300, y: 320, r: 1.1, twinkle: true },
  { x: 520, y: 240, r: 0.7, twinkle: false },
  { x: 760, y: 210, r: 1.1, twinkle: false },
  { x: 910, y: 280, r: 0.7, twinkle: false },
  { x: 1120, y: 250, r: 1.6, twinkle: false },
  { x: 1310, y: 300, r: 0.7, twinkle: false },
  { x: 80, y: 420, r: 1.1, twinkle: false },
  { x: 250, y: 480, r: 0.7, twinkle: false },
  { x: 420, y: 380, r: 1.1, twinkle: false },
  { x: 610, y: 330, r: 0.7, twinkle: true },
  { x: 790, y: 400, r: 1.6, twinkle: false },
  { x: 1010, y: 370, r: 0.7, twinkle: false },
  { x: 1180, y: 440, r: 1.1, twinkle: true },
  { x: 1400, y: 410, r: 0.7, twinkle: false },
  { x: 160, y: 610, r: 1.6, twinkle: false },
  { x: 350, y: 570, r: 0.7, twinkle: false },
  { x: 560, y: 500, r: 1.1, twinkle: false },
  { x: 740, y: 540, r: 0.7, twinkle: false },
  { x: 930, y: 490, r: 1.1, twinkle: false },
  { x: 1100, y: 580, r: 0.7, twinkle: false },
  { x: 1290, y: 530, r: 1.6, twinkle: true },
  { x: 60, y: 780, r: 0.7, twinkle: false },
  { x: 280, y: 700, r: 1.1, twinkle: false },
  { x: 470, y: 760, r: 0.7, twinkle: false },
  { x: 650, y: 660, r: 1.6, twinkle: false },
  { x: 820, y: 720, r: 0.7, twinkle: false },
  { x: 990, y: 780, r: 1.1, twinkle: false },
  { x: 1160, y: 700, r: 0.7, twinkle: false },
  { x: 1340, y: 760, r: 1.1, twinkle: false },
  { x: 540, y: 850, r: 0.7, twinkle: true },
  { x: 900, y: 860, r: 1.1, twinkle: false },
  { x: 1240, y: 840, r: 0.7, twinkle: false },
];

function latticeNodeAt(index: number): LatticeNode {
  const node = latticeNodes[index];
  if (node === undefined) {
    throw new Error(`lattice references missing node ${index}`);
  }
  return node;
}

export function latticeRoutePath(route: LatticeRoute): string {
  return route
    .map((nodeIndex, position) => {
      const { x, y } = latticeNodeAt(nodeIndex);
      const command = position === 0 ? "M" : "L";
      return `${command} ${x} ${y}`;
    })
    .join(" ");
}

export function cometTrailPath(trail: CometTrail): string {
  return `M ${trail.from.x} ${trail.from.y} L ${trail.to.x} ${trail.to.y}`;
}

const viewBox = `0 0 ${latticeViewBox.width} ${latticeViewBox.height}`;

export function AmbientBackdrop() {
  return (
    <div className="ambient" aria-hidden="true">
      <div className="ambient-aurora ambient-aurora-near" />
      <div className="ambient-aurora ambient-aurora-far" />
      <div className="ambient-aurora ambient-aurora-deep" />
      <svg
        className="ambient-starfield"
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid slice"
        role="presentation"
        focusable="false"
      >
        <g className="ambient-starfield-static">
          {starfieldStars
            .filter((star) => !star.twinkle)
            .map((star) => (
              <circle key={`${star.x}-${star.y}`} cx={star.x} cy={star.y} r={star.r} />
            ))}
        </g>
        <g className="ambient-starfield-twinkle">
          {starfieldStars
            .filter((star) => star.twinkle)
            .map((star) => (
              <circle key={`${star.x}-${star.y}`} cx={star.x} cy={star.y} r={star.r} />
            ))}
        </g>
      </svg>
      <div className="ambient-horizon" />
      <div className="ambient-grid" />
      <svg
        className="ambient-lattice"
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid slice"
        role="presentation"
        focusable="false"
      >
        <g className="ambient-lattice-edges">
          {latticeEdges.map(([from, to]) => {
            const start = latticeNodeAt(from);
            const end = latticeNodeAt(to);
            return <line key={`${from}-${to}`} x1={start.x} y1={start.y} x2={end.x} y2={end.y} />;
          })}
        </g>
        <g className="ambient-lattice-pulses">
          {latticePulseRoutes.map((route) => (
            <path
              key={route.join("-")}
              className="ambient-lattice-pulse"
              d={latticeRoutePath(route)}
              pathLength={100}
            />
          ))}
        </g>
        <g className="ambient-lattice-nodes">
          {latticeNodes.map((node) => (
            <circle key={`${node.x}-${node.y}`} cx={node.x} cy={node.y} r={node.r} />
          ))}
        </g>
      </svg>
      <svg
        className="ambient-comets"
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid slice"
        role="presentation"
        focusable="false"
      >
        {cometTrails.map((trail) => (
          <g key={`${trail.from.x}-${trail.from.y}`} className="ambient-comet">
            <path className="ambient-comet-tail" d={cometTrailPath(trail)} pathLength={100} />
            <path className="ambient-comet-head" d={cometTrailPath(trail)} pathLength={100} />
          </g>
        ))}
      </svg>
      <div className="ambient-shimmer" />
      <svg className="ambient-grain" role="presentation" focusable="false">
        <filter id="ambient-grain-texture">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#ambient-grain-texture)" />
      </svg>
      <div className="ambient-vignette" />
    </div>
  );
}
