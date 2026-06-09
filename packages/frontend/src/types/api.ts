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
}

export interface WeeklySummary {
  weekStart: string;
  weekEnd: string;
  sessionsCount: number;
  problemsSolved: number;
  totalStudyMinutes: number;
  averageProductivity: number;
  currentStreakDays: number;
  longestStreakDays: number;
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

export interface SendChatResult {
  threadId: string;
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
}
