export interface WarmupQueueOptions {
  /** Max Forgot re-queues per question before auto-advance (default 2). */
  maxExtraPasses?: number;
}

export interface WarmupQueueState {
  questionCount: number;
  /** Pending question indices; the current question is always `queue[0]`. */
  queue: number[];
  /** Index of the question currently shown (equals `queue[0]` while active). */
  currentIndex: number;
  done: boolean;
  /** Final SM-2 grade per question index — last grade wins. */
  finalGrades: Record<number, number>;
  requeueCount: Record<number, number>;
  maxExtraPasses: number;
}

export function initWarmupQueue(
  questionCount: number,
  options: WarmupQueueOptions = {},
): WarmupQueueState {
  const queue = Array.from({ length: questionCount }, (_, i) => i);
  return {
    questionCount,
    queue,
    currentIndex: queue[0] ?? 0,
    done: questionCount === 0,
    finalGrades: {},
    requeueCount: {},
    maxExtraPasses: options.maxExtraPasses ?? 2,
  };
}

export function gradeWarmup(state: WarmupQueueState, quality: number): WarmupQueueState {
  if (state.done || state.queue.length === 0) return state;

  const qIdx = state.queue[0]!;
  const isForgot = quality < 3;

  if (!isForgot) {
    return completeQuestion(state, qIdx, quality);
  }

  const extraPasses = state.requeueCount[qIdx] ?? 0;
  if (extraPasses >= state.maxExtraPasses) {
    return completeQuestion(state, qIdx, quality);
  }

  const queue = [...state.queue.slice(1), qIdx];
  return {
    ...state,
    queue,
    currentIndex: queue[0] ?? qIdx,
    requeueCount: { ...state.requeueCount, [qIdx]: extraPasses + 1 },
  };
}

function completeQuestion(
  state: WarmupQueueState,
  qIdx: number,
  quality: number,
): WarmupQueueState {
  const finalGrades = { ...state.finalGrades, [qIdx]: quality };
  const queue = state.queue.slice(1);

  if (queue.length === 0) {
    return {
      ...state,
      queue,
      finalGrades,
      done: true,
    };
  }

  return {
    ...state,
    queue,
    currentIndex: queue[0]!,
    finalGrades,
  };
}

/** Mean of final per-question grades — caller rounds for SM-2 (same as WarmupCard). */
export function warmupAverageQuality(state: WarmupQueueState): number {
  const grades = Object.values(state.finalGrades);
  if (grades.length === 0) return 0;
  return grades.reduce((sum, g) => sum + g, 0) / grades.length;
}
