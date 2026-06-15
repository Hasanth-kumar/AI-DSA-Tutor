import { useEffect, useState } from "react";
import {
  gradeWarmup,
  initWarmupQueue,
  warmupAverageQuality,
  type WarmupQueueState,
} from "@dsa/intelligence";
import { api } from "../api/client.js";
import type { WarmupQuestions } from "../types/api.js";

interface Props {
  topicId: string;
  topicName: string;
  /**
   * LeetCode URL of the first suggested problem. Opened synchronously on the
   * final grade / skip click (a real user gesture) so the browser doesn't block
   * the tab — `onComplete` itself fires from a timer, too late to open then.
   */
  firstProblemUrl?: string | null;
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
 * Forgot re-queues at end of queue (ADR Decision C); see warmupQueue reducer.
 */
export function WarmupCard({
  topicId,
  topicName,
  firstProblemUrl,
  onComplete,
}: Props) {
  const openFirstProblem = () => {
    if (firstProblemUrl) {
      window.open(firstProblemUrl, "_blank", "noopener,noreferrer");
    }
  };
  const [data, setData] = useState<WarmupQuestions | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [queue, setQueue] = useState<WarmupQueueState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getWarmupQuestions(topicId)
      .then((res) => {
        if (!cancelled) {
          setData(res);
          setQueue(initWarmupQueue(res.questions.length));
        }
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

  const finish = async (finalQueue: WarmupQueueState) => {
    setSubmitting(true);
    try {
      const quality = Math.round(warmupAverageQuality(finalQueue));
      const res = await api.gradeWarmup(topicId, quality);
      setResult(
        `Recall graded ${quality}/5 — next ${topicName} review in ${res.intervalDays} day${res.intervalDays === 1 ? "" : "s"}.`,
      );
      setTimeout(() => onComplete(true), 1600);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to grade warm-up");
      setSubmitting(false);
    }
  };

  const grade = (quality: number) => {
    if (!data || !queue || submitting) return;
    const next = gradeWarmup(queue, quality);
    setQueue(next);
    if (next.done) {
      // Synchronous with the click so the LeetCode tab isn't popup-blocked.
      openFirstProblem();
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

  if (!data || !queue) {
    return (
      <div className="warmup-card card">
        <p className="muted m-0">
          Preparing {topicName} recall questions…
        </p>
        <button
          type="button"
          className="btn btn-ghost mt-3"
          onClick={() => onComplete(false)}
        >
          Skip warm-up
        </button>
      </div>
    );
  }

  const questionIndex = queue.currentIndex;

  return (
    <div className="warmup-card card">
      <div className="warmup-header">
        <span className="warmup-title">5-minute recall warm-up</span>
        <span className="warmup-progress">
          {questionIndex + 1} / {data.questions.length}
          {data.source === "notes" ? " · from your notes" : ""}
        </span>
      </div>

      <p className="warmup-question">{data.questions[questionIndex]}</p>
      <p className="muted text-xs mt-0 mb-3">
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
        className="btn btn-ghost mt-3"
        disabled={submitting}
        onClick={() => {
          openFirstProblem();
          onComplete(false);
        }}
      >
        Skip warm-up
      </button>
    </div>
  );
}
