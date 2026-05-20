/** Shared intelligence types — engines are pure computation, no I/O. */

export type TopicDifficulty = "Easy" | "Medium" | "Hard";
export type TopicStatus = "Not started" | "In progress" | "Mastered";

export interface TopicState {
  id: string;
  name: string;
  difficulty: TopicDifficulty;
  status: TopicStatus;
  confidence: number;
  revisionCount: number;
  lastRevised: Date | null;
  nextRevisionAt: Date | null;
  isWeakArea: boolean;
  problemsSolved: number;
  totalAttempts: number;
  averageTimeTaken: number;
  prerequisites: string[];
  recentSessions: SessionSnapshot[];
}

export interface SessionSnapshot {
  date: Date;
  problemsSolved: number;
  productivityScore: number;
  duration: number;
}

export interface PriorityScore {
  topicId: string;
  total: number;
  breakdown: {
    urgency: number;
    weakness: number;
    confidence: number;
    prerequisiteReady: number;
    recency: number;
    difficulty: number;
  };
  recommendation: "Study now" | "Review soon" | "Practice more" | "Maintain";
}

export interface ProblemSuggestion {
  problemId: string;
  name: string;
  difficulty: TopicDifficulty;
  leetcodeLink?: string;
}

export interface StudyPlan {
  date: Date;
  primaryTopic: TopicState;
  revisionTopics: TopicState[];
  suggestedProblems: ProblemSuggestion[];
  estimatedDuration: number;
  reasoning: string;
}

export interface PlanOptions {
  maxRevisionTopics?: number;
  availableMinutes?: number;
}

export interface PriorityWeights {
  urgency: number;
  weakness: number;
  confidence: number;
  prerequisite: number;
  recency: number;
}

export interface SM2State {
  interval: number;
  repetition: number;
  efactor: number;
  nextRevisionAt: Date;
}

export interface WeaknessSignal {
  name: string;
  weight: number;
  value: number;
  description: string;
}

export interface WeaknessAnalysis {
  topicId: string;
  score: number;
  isWeak: boolean;
  signals: WeaknessSignal[];
  recommendation: string;
}

export interface WeaknessReport {
  weakTopics: WeaknessAnalysis[];
  strongTopics: WeaknessAnalysis[];
  summary: string;
}

export interface DifficultyRecommendation {
  primary: TopicDifficulty;
  secondary: TopicDifficulty | null;
  ratio: [number, number];
}

export interface PrerequisiteViolation {
  topicId: string;
  topicName: string;
  missingPrerequisites: string[];
}

export interface IntelligenceUpdate {
  sm2: SM2State;
  weaknessUpdate: WeaknessAnalysis;
}

export interface IntelligenceSnapshot {
  generatedAt: Date;
  topicScores: PriorityScore[];
  revisionQueue: TopicState[];
  weaknessReport: WeaknessReport;
  prerequisiteViolations: PrerequisiteViolation[];
  unlockedTopicIds: string[];
  summary: string;
}
