import type { StudyPlan } from "../types/api.js";

interface Props {
  plan: StudyPlan | null;
}

export function TodayPlan({ plan }: Props) {
  if (!plan) {
    return (
      <div className="card">
        <h3>Today&apos;s plan</h3>
        <p className="muted" style={{ fontSize: "0.875rem" }}>Loading plan…</p>
      </div>
    );
  }

  return (
    <div className="card">
      <h3>Today&apos;s plan</h3>

      <div className="plan-topic">
        {plan.primaryTopic.name}
        <span className="plan-duration">~{plan.estimatedDuration} min</span>
      </div>

      {plan.curriculum && (
        <p className="plan-curriculum-step muted">
          Step {plan.curriculum.currentIndex + 1} of {plan.curriculum.topicNames.length}
          {plan.curriculum.activeTopicId ? " · manual focus" : " · auto-advance"}
        </p>
      )}

      <p className="plan-reasoning">{plan.reasoning}</p>

      {plan.suggestedProblems.length > 0 && (
        <ul className="plan-problems">
          {plan.suggestedProblems.map((p) => (
            <li key={p.problemId} className="plan-problem-item">
              <span>{p.name}</span>
              <span
                className={`diff-badge diff-${p.difficulty?.toLowerCase() ?? "medium"}`}
              >
                {p.difficulty ?? "?"}
              </span>
            </li>
          ))}
        </ul>
      )}

      {plan.revisionTopics.length > 0 && (
        <p
          className="muted"
          style={{ marginTop: "0.85rem", fontSize: "0.8rem", borderTop: "1px solid var(--border-soft)", paddingTop: "0.75rem" }}
        >
          Revise: {plan.revisionTopics.map((t) => t.name).join(", ")}
        </p>
      )}
    </div>
  );
}
