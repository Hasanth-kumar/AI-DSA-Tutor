/** Got it (5) / Shaky (3) / Forgot (1) — same SM-2 grades the warm-up uses. */
export function RevisionGradeButtons({
  busy,
  onGrade,
}: {
  busy: boolean;
  onGrade: (quality: number) => void;
}) {
  const options = [
    { label: "Got it", quality: 5 },
    { label: "Shaky", quality: 3 },
    { label: "Forgot", quality: 1 },
  ];
  const toneClass = (label: string) =>
    label === "Got it"
      ? " revision-grade-btn--got"
      : label === "Shaky"
        ? " revision-grade-btn--shaky"
        : " revision-grade-btn--forgot";

  return (
    <div className="revision-grade-row">
      {options.map(({ label, quality }) => (
        <button
          key={label}
          type="button"
          className={`btn-secondary-v2 revision-grade-btn${toneClass(label)}`}
          disabled={busy}
          onClick={() => onGrade(quality)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
