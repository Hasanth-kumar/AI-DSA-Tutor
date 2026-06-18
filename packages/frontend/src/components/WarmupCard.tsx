import { useEffect, useState } from "react";
import {
  gradeWarmup,
  initWarmupQueue,
  warmupAverageQuality,
  formatWarmupAnswer,
  isWalkthroughWarmupAnswer,
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

function isUsableWarmupAnswer(answer?: string): boolean {
  const trimmed = answer?.trim() ?? "";
  if (!trimmed) return false;
  if (/^(state|name|identify|compare|explain|describe|list|recall)\b/i.test(trimmed)) {
    return false;
  }
  if (isWalkthroughWarmupAnswer(trimmed)) return false;
  return formatWarmupAnswer(trimmed).length > 0;
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
  const [answerVisible, setAnswerVisible] = useState(false);
  const [revealedAnswers, setRevealedAnswers] = useState<Record<number, string>>({});
  const [answerUnavailable, setAnswerUnavailable] = useState<
    Record<number, "coach_offline" | "generation_failed">
  >({});
  const [answerLoading, setAnswerLoading] = useState(false);
  const [answerError, setAnswerError] = useState<string | null>(null);

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

  useEffect(() => {
    setAnswerVisible(false);
    setAnswerError(null);
  }, [queue?.currentIndex]);

  const showAnswer = async (questionIndex: number, question: string, preloaded?: string) => {
    const existing = revealedAnswers[questionIndex];
    if (existing && formatWarmupAnswer(existing)) {
      setAnswerVisible(true);
      return;
    }

    const cached = preloaded?.trim() ?? "";
    if (isUsableWarmupAnswer(cached)) {
      setRevealedAnswers((prev) => ({ ...prev, [questionIndex]: formatWarmupAnswer(cached) }));
      setAnswerUnavailable((prev) => {
        const next = { ...prev };
        delete next[questionIndex];
        return next;
      });
      setAnswerVisible(true);
      return;
    }

    setAnswerLoading(true);
    setAnswerError(null);
    try {
      const res = await api.revealWarmupAnswer(topicId, question);
      const answer = formatWarmupAnswer(res.answer);
      if (answer) {
        setRevealedAnswers((prev) => ({ ...prev, [questionIndex]: answer }));
        setAnswerUnavailable((prev) => {
          const next = { ...prev };
          delete next[questionIndex];
          return next;
        });
      } else {
        setAnswerUnavailable((prev) => ({
          ...prev,
          [questionIndex]: res.unavailableReason ?? "generation_failed",
        }));
      }
      setAnswerVisible(true);
    } catch (err) {
      setAnswerError(err instanceof Error ? err.message : "Failed to load answer");
    } finally {
      setAnswerLoading(false);
    }
  };

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
  const currentQuestion = data.questions[questionIndex];
  const displayedAnswer = revealedAnswers[questionIndex];
  const formattedAnswer = formatWarmupAnswer(displayedAnswer ?? "");
  const unavailableReason = answerUnavailable[questionIndex];
  const answerHint =
    unavailableReason === "coach_offline"
      ? "Coach isn’t connected — add your OpenRouter API key to see model answers."
      : "Couldn’t generate a concise answer — grade your recall from memory.";

  return (
    <div className="warmup-card card">
      <div className="warmup-header">
        <span className="warmup-title">5-minute recall warm-up</span>
        <span className="warmup-progress">
          {questionIndex + 1} / {data.questions.length}
          {data.source === "notes" ? " · from your notes" : ""}
        </span>
      </div>

      <p className="warmup-question">{currentQuestion.question}</p>
      <p className="muted text-xs mt-0 mb-3">
        Answer out loud or in your head, then grade your recall.
      </p>

      {!answerVisible ? (
        <button
          type="button"
          className="btn btn-ghost warmup-show-answer-btn"
          disabled={submitting || answerLoading}
          onClick={() => void showAnswer(questionIndex, currentQuestion.question, currentQuestion.answer)}
        >
          {answerLoading ? "Loading answer…" : "Show Answer"}
        </button>
      ) : (
        <div className="warmup-answer">
          <span className="warmup-answer-label">Answer</span>
          {formattedAnswer ? (
            <p className="warmup-answer-text">{formattedAnswer}</p>
          ) : (
            <p className="warmup-answer-text warmup-answer-text--empty">{answerHint}</p>
          )}
        </div>
      )}

      {answerError ? (
        <p className="error-banner warmup-answer-error">{answerError}</p>
      ) : null}

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
