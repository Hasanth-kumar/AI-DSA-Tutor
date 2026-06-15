export type TopicStatus = "Not started" | "In progress" | "Mastered";
export type TopicDifficulty = "Easy" | "Medium" | "Hard";

export interface Topic {
  id: string;
  name: string;
  difficulty: TopicDifficulty;
  status: TopicStatus;
  confidence: number;
  revisionCount: number;
  lastRevised: string | null;
  nextRevisionAt: string | null;
  isWeakArea: boolean;
  problemsSolved: number;
  totalAttempts: number;
  averageTimeTaken: number;
  prerequisites: string[];
}

export interface PriorityScore {
  topicId: string;
  total: number;
  recommendation: string;
  memoryExecutionDivergence?: boolean;
}

export interface Problem {
  id: string;
  name: string;
  topicId: string | null;
  difficulty: TopicDifficulty | null;
  leetcodeLink: string | null;
  githubUrl: string | null;
  status: string;
  attempts: number;
}

export interface Session {
  id: string;
  date: number;
  topicId: string | null;
  problemsSolved: number;
  studyDuration: number;
  productivityScore: number;
}

export interface CurriculumItem {
  name: string;
  topicId: string | null;
  status: "complete" | "current" | "upcoming" | "missing";
  unsolvedCount: number;
  totalCount: number;
}

export interface CurriculumProgress {
  topicNames: string[];
  currentIndex: number;
  activeTopicId: string | null;
  items: CurriculumItem[];
}

export interface CurriculumState {
  topicNames: string[];
  activeTopicId: string | null;
  selection: {
    topic: Topic;
    index: number;
    items: CurriculumItem[];
    reasoning: string;
  } | null;
}

export interface StudyPlan {
  date: string;
  primaryTopic: Topic;
  revisionTopics: Topic[];
  suggestedProblems: {
    problemId: string;
    name: string;
    difficulty: TopicDifficulty;
    leetcodeLink?: string;
  }[];
  estimatedDuration: number;
  reasoning: string;
  curriculum?: CurriculumProgress;
  revisionTotalDue?: number;
  revisionDeferred?: number;
  memoryExecutionDivergence?: boolean;
  divergentTopics?: { id: string; name: string }[];
}

export type MistakeTag =
  | "wrong-approach"
  | "edge-case"
  | "off-by-one"
  | "pattern-recall";

export const MISTAKE_TAG_OPTIONS: { tag: MistakeTag; label: string }[] = [
  { tag: "wrong-approach", label: "Wrong approach" },
  { tag: "edge-case", label: "Missed edge case" },
  { tag: "off-by-one", label: "Off-by-one" },
  { tag: "pattern-recall", label: "Couldn't recall pattern" },
];

const MISTAKE_TAG_LABELS: Record<string, string> = Object.fromEntries(
  MISTAKE_TAG_OPTIONS.map((o) => [o.tag, o.label]),
);

/** Human label for a stored mistake tag, falling back to the raw key. */
export function mistakeTagLabel(tag: string): string {
  return MISTAKE_TAG_LABELS[tag] ?? tag;
}

export interface ProblemNote {
  path: string;
  title: string;
  content: string;
  contentPlain: string;
  matchedBy: "frontmatter" | "filename" | null;
  updatedAt: string;
}

export interface WarmupQuestions {
  topicId: string;
  topicName: string;
  questions: string[];
  source: "notes" | "generic" | "fallback";
}

export interface RecallGradeResult {
  topicId: string;
  quality: number;
  nextRevisionAt: string | null;
  intervalDays: number;
}

export interface ScoreExplanation {
  topicId: string;
  topicName: string;
  total: number;
  recommendation: string;
  memoryExecutionDivergence?: boolean;
  breakdown: {
    urgency: number;
    weakness: number;
    confidence: number;
    prerequisiteReady: number;
    recency: number;
    difficulty: number;
  };
  weights: string;
  explanation: string[];
}

export interface WeaknessEvidence {
  topicId: string;
  topicName: string;
  analysis: {
    score: number;
    isWeak: boolean;
    signals: { name: string; weight: number; value: number; description: string }[];
    recommendation: string;
  };
  evidence: {
    mistakeTagCounts: Record<string, number>;
    noteCoverage: { solved: number; withNotes: number };
    slowProblems: { id: string; name: string; timeTaken: number | null }[];
    lowProductivitySessions: { date: string; productivityScore: number; duration: number }[];
  };
}

export interface SyncConflict {
  id: string;
  entityType: "topic" | "problem";
  entityId: string;
  entityName: string | null;
  localValue: Record<string, unknown>;
  remoteValue: Record<string, unknown>;
  detectedAt: string;
}

export interface SyncStatusInfo {
  lastSyncAt: string | null;
  pendingTopics: number;
  pendingProblems: number;
  unresolvedConflicts: number;
}

export interface ServiceHealth {
  status: "ok" | "degraded" | "down";
  message?: string;
  latencyMs?: number;
}

export interface DayDetail {
  date: string;
  sessions: {
    id: string;
    topicId: string | null;
    topicName: string | null;
    problemsSolved: number;
    studyDuration: number | null;
    productivityScore: number | null;
  }[];
  problems: {
    problemId: string;
    problemName: string;
    timeTaken: number | null;
    mistakeTags: string[];
  }[];
}

export interface HealthInfo {
  status: "ok" | "degraded" | "down";
  timestamp: string;
  services?: {
    api: ServiceHealth;
    sqlite: ServiceHealth;
    notion: ServiceHealth;
    llm: ServiceHealth;
  };
  sync?: SyncStatusInfo;
}

export interface WeeklySummary {
  weekStart: string;
  weekEnd: string;
  sessionsCount: number;
  sessionsThisMonth?: number;
  problemsSolved: number;
  totalStudyMinutes: number;
  averageProductivity: number;
  currentStreakDays: number;
  longestStreakDays: number;
  weakTopics?: { id: string; name: string; score: number }[];
  divergentTopics?: { id: string; name: string }[];
  masteredTopics: number;
  inProgressTopics: number;
  velocityTrend: "up" | "down" | "stable";
  problemsPerHour: number;
  weaknessTrendDirection: "improving" | "worsening" | "stable";
}

export interface StreakInfo {
  currentStreakDays: number;
  longestStreakDays: number;
  activeDays: string[];
  lastSessionDate: string | null;
}

export interface MasteryVelocityPoint {
  weekStart: string;
  weekEnd: string;
  problemsSolved: number;
  studyMinutes: number;
  problemsPerHour: number;
  sessionsCount: number;
}

export interface WeaknessTrendPoint {
  weekStart: string;
  weakTopicCount: number;
  averageWeaknessScore: number;
}

export interface SessionResult {
  session: Session;
  topicId: string;
  problemId?: string;
  attemptId?: string;
  confidence: number;
  isWeakArea: boolean;
  summary: string;
}

export interface DifficultyBucket {
  difficulty: TopicDifficulty;
  problemsTotal: number;
  problemsSolved: number;
  solveRate: number;
  averageAttempts: number;
  averageTimeMinutes: number;
}

export interface TopicDifficultyAlignment {
  topicId: string;
  topicName: string;
  topicDifficulty: TopicDifficulty;
  recommendedDifficulty: TopicDifficulty;
  alignment: "aligned" | "stretching" | "too_easy";
  solveRate: number;
}

export interface DifficultyAnalysis {
  byDifficulty: DifficultyBucket[];
  byTopic: TopicDifficultyAlignment[];
  summary: string;
}

export interface AnalyticsDashboard {
  summary: WeeklySummary;
  velocity: {
    weekly: MasteryVelocityPoint[];
    topics: { topicId: string; topicName: string; problemsSolved: number }[];
  };
  weaknessTrend: WeaknessTrendPoint[];
  difficulty: DifficultyAnalysis;
  plan?: StudyPlan;
}

export interface LeetCodeDifficultyStats {
  difficulty: TopicDifficulty | "All";
  solved: number;
  submissions: number;
}

export interface LeetCodeUserStats {
  username: string;
  ranking: number | null;
  totalSolved: number;
  totalSubmissions: number;
  byDifficulty: LeetCodeDifficultyStats[];
  fetchedAt: string;
}

/** ISO date (YYYY-MM-DD, UTC) → accepted submissions that day */
export interface LeetCodeActivity {
  username: string;
  dailyCounts: Record<string, number>;
  currentStreak: number;
  fetchedAt: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface ChatThread {
  threadId: string;
  messages: ChatMessage[];
  updatedAt: string;
}

export interface ChatThreadSummary {
  threadId: string;
  preview: string;
  updatedAt: string;
}

export interface CoachModel {
  id: string;
  label: string;
  model: string;
}

export interface CoachModelList {
  models: CoachModel[];
  defaultModelId: string;
}

export interface SendChatResult {
  threadId: string;
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
}

export interface ChatThreadList {
  threads: ChatThreadSummary[];
}

export interface ChatStreamEvent {
  type: "meta" | "chunk" | "done" | "error";
  threadId?: string;
  userMessage?: ChatMessage;
  text?: string;
  assistantMessage?: ChatMessage;
  message?: string;
}
