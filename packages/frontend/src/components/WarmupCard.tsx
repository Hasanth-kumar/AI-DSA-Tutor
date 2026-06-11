import { useEffect, useState } from "react";
import { api } from "../api/client.js";
import type { WarmupQuestions } from "../types/api.js";

interface Props {
  topicId: string;
  topicName: string;
  /** Called when the warm-up finishes or is skipped. */
  onComplete: (graded: boolean) => void;
}

/** Self-grade options mapped to SM-2 quality (0–5). */
const GRADES: { label: string; quality: number; hint: string }[] = [
  { label: "Forgot", quality: 1, hint: "Couldn't recall" },
  { label: "Hard", quality: 3, hint: "Recalled with effort" },
  { label: "Good", quality: 4, hint: "Recalled with minor gaps" },
  { label: "Easy", quality: 5, hint: "Instant recall" },
];

/**
 * Active recall warm-up (3.1): 3 quick questions before coding, inline in the
 * session-start flow. Per-question self-grades average into one SM-2 quality.
 */
export function WarmupCard({ topicId, topicName, onComplete }: Props) {
  const [data, setData] = useState<WarmupQuestions | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [grades, setGrades] = useState<number[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getWarmupQuestions(topicId)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load warm-up");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [topicId]);

  const finish = async (allGrades: number[]) => {
    setSubmitting(true);
    try {
      const quality =
        allGrades.reduce((sum, q) => sum + q, 0) / Math.max(1, allGrades.length);
      const res = await api.gradeWarmup(topicId, Math.round(quality));
      setResult(
        `Recall graded ${Math.round(quality)}/5 — next ${topicName} review in ${res.intervalDays} day${res.intervalDays === 1 ? "" : "s"}.`,
      );
      setTimeout(() => onComplete(true), 1600);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to grade warm-up");
      setSubmitting(false);
    }
  };

  const grade = (quality: number) => {
    if (!data || submitting) return;
    const next = [...grades, quality];
    setGrades(next);
    if (index + 1 < data.questions.length) {
      setIndex(index + 1);
    } else {
      void finish(next);
    }
  };

  if (error) {
    return (
      <div className="warmup-card card">
        <div className="error-banner">{error}</div>
        <button type="button" className="btn" onClick={() => onComplete(false)}>
          Continue without warm-up
        </button>
      </div>
    );
  }

  if (result) {
    return (
      <div className="warmup-card card">
        <div className="success-banner">{result}</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="warmup-card card">
        <p className="muted" style={{ margin: 0 }}>
          Preparing {topicName} recall questions…
        </p>
        <button
          type="button"
          className="btn btn-ghost"
          style={{ marginTop: "0.75rem" }}
          onClick={() => onComplete(false)}
        >
          Skip warm-up
        </button>
      </div>
    );
  }

  return (
    <div className="warmup-card card">
      <div className="warmup-header">
        <span className="warmup-title">5-minute recall warm-up</span>
        <span className="warmup-progress">
          {index + 1} / {data.questions.length}
          {data.source === "notes" ? " · from your notes" : ""}
        </span>
      </div>

      <p className="warmup-question">{data.questions[index]}</p>
      <p className="muted" style={{ fontSize: "0.78rem", margin: "0 0 0.75rem" }}>
        Answer out loud or in your head, then grade your recall.
      </p>

      <div className="warmup-grades">
        {GRADES.map((g) => (
          <button
            key={g.label}
            type="button"
            className="btn warmup-grade-btn"
            title={g.hint}
            disabled={submitting}
            onClick={() => grade(g.quality)}
          >
            {g.label}
          </button>
        ))}
      </div>

      <button
        type="button"
        className="btn btn-ghost"
        style={{ marginTop: "0.75rem" }}
        disabled={submitting}
        onClick={() => onComplete(false)}
      >
        Skip warm-up
      </button>
    </div>
  );
}
