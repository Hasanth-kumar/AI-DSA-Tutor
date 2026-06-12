import { useState } from "react";
import { api } from "../api/client.js";
import { CheckCircleIcon, EmptyState } from "./EmptyState.js";
import { SkeletonLines } from "./Skeleton.js";
import type { WeaknessEvidence } from "../types/api.js";

interface Props {
  weakTopics: { id: string; name: string; score: number }[];
}

/**
 * Weakness evidence drill-down (5.4): clicking a weak topic shows why it's
 * flagged — slow problems, failed revisions, mistake-tag counts, note coverage.
 */
export function WeaknessDrilldown({ weakTopics }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<WeaknessEvidence | null>(null);
  const [loading, setLoading] = useState(false);

  if (weakTopics.length === 0) {
    return (
      <EmptyState
        compact
        icon={<CheckCircleIcon />}
        title="No weak areas flagged"
        hint="Keep solving — anything that needs attention will surface here."
      />
    );
  }

  const toggle = (topicId: string) => {
    if (openId === topicId) {
      setOpenId(null);
      return;
    }
    setOpenId(topicId);
    setEvidence(null);
    setLoading(true);
    api
      .getWeaknessEvidence(topicId)
      .then(setEvidence)
      .catch(() => setEvidence(null))
      .finally(() => setLoading(false));
  };

  return (
    <div className="weakness-drilldown">
      <div className="mistake-tag-chips" style={{ marginTop: "0.6rem" }}>
        {weakTopics.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`weak-topic-chip${openId === t.id ? " weak-topic-chip--open" : ""}`}
            onClick={() => toggle(t.id)}
          >
            {t.name} · {Math.round(t.score * 100)}%
          </button>
        ))}
      </div>

      {openId && (
        <div className="weakness-evidence">
          {loading && <SkeletonLines lines={2} />}
          {!loading && evidence && (
            <>
              <p className="text-sm mt-0 mb-2">
                {evidence.analysis.recommendation}
              </p>
              {evidence.analysis.signals.length > 0 && (
                <ul className="graph-panel-signals">
                  {evidence.analysis.signals.map((s) => (
                    <li key={s.name}>{s.description}</li>
                  ))}
                </ul>
              )}
              {Object.keys(evidence.evidence.mistakeTagCounts).length > 0 && (
                <div className="mistake-tag-chips">
                  {Object.entries(evidence.evidence.mistakeTagCounts).map(([tag, n]) => (
                    <span key={tag} className="mistake-tag-chip">
                      {tag} ×{n}
                    </span>
                  ))}
                </div>
              )}
              {evidence.evidence.slowProblems.length > 0 && (
                <>
                  <div className="day-detail-label">Slow problems</div>
                  <ul className="day-detail-list">
                    {evidence.evidence.slowProblems.map((p) => (
                      <li key={p.id}>
                        <span>{p.name}</span>
                        <span className="muted">{p.timeTaken}m</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {evidence.evidence.lowProductivitySessions.length > 0 && (
                <>
                  <div className="day-detail-label">Low-productivity sessions</div>
                  <ul className="day-detail-list">
                    {evidence.evidence.lowProductivitySessions.map((s, i) => (
                      <li key={i}>
                        <span>{new Date(s.date).toLocaleDateString()}</span>
                        <span className="muted">
                          {s.productivityScore}/100 · {s.duration}m
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {evidence.evidence.noteCoverage.solved > 0 && (
                <p className="muted text-xs mt-2 mb-0">
                  Notes on {evidence.evidence.noteCoverage.withNotes}/
                  {evidence.evidence.noteCoverage.solved} solved problems.
                </p>
              )}
            </>
          )}
          {!loading && !evidence && (
            <p className="muted text-sm m-0">No evidence available.</p>
          )}
        </div>
      )}
    </div>
  );
}
