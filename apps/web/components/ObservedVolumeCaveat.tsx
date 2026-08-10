export const TOKEN_COLUMN_VOLUME_CAVEAT =
  "These are volumes observed in Vex agent activity, not market volume. One swap contributes to both of its tokens, so this column does not sum to total volume.";

export const TOKEN_FIGURE_VOLUME_CAVEAT =
  "This is volume observed in Vex agent activity, not market volume. A swap counts on both of its tokens.";

export function ObservedVolumeCaveat({ id, caveat }: { id: string; caveat: string }) {
  return (
    <span className="figure-note">
      <button
        type="button"
        className="figure-note-marker"
        aria-label="What observed volume means"
        aria-describedby={id}
      >
        i
      </button>
      <span id={id} role="note" className="figure-note-text">
        {caveat}
      </span>
    </span>
  );
}
