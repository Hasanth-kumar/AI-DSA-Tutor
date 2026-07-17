import { Fragment } from "react";

export const SESSION_STEPS = ["Warm-up", "Focus", "Capture", "Done"] as const;
/** Optional "Revise" segment shown only while the revision offer is active (C). */
export const SESSION_STEPS_REVISE = ["Warm-up", "Focus", "Capture", "Revise", "Done"] as const;

export function SessionProgress({
  step,
  steps = SESSION_STEPS,
}: {
  step: number;
  steps?: readonly string[];
}) {
  return (
    <div className="session-progress" role="group" aria-label="Session progress">
      {steps.map((label, i) => (
        <Fragment key={label}>
          {i > 0 && (
            <span
              className={`session-progress-line${i <= step ? " session-progress-line--done" : ""}`}
              aria-hidden="true"
            />
          )}
          <span
            className={`session-progress-step${i < step ? " session-progress-step--done" : ""}${
              i === step ? " session-progress-step--current" : ""
            }`}
            aria-current={i === step ? "step" : undefined}
          >
            <span className="session-progress-dot" aria-hidden="true" />
            <span>{label}</span>
          </span>
        </Fragment>
      ))}
    </div>
  );
}
