export function AmbientBackdrop() {
  return (
    <div className="ambient" aria-hidden="true">
      <div className="ambient-aurora ambient-aurora-near" />
      <div className="ambient-aurora ambient-aurora-far" />
      <div className="ambient-aurora ambient-aurora-deep" />
      <div className="ambient-horizon" />
      <div className="ambient-grid" />
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
