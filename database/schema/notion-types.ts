/** Notion property shapes matching your DSA databases. */

export type TopicDifficulty = "Easy" | "Medium" | "Hard";
export type TopicStatus = "Not started" | "In progress" | "Mastered";
export type ProblemStatus = "Not started" | "Solved" | "Revision needed";

export interface NotionTopic {
  id: string;
  name: string;
  difficulty?: TopicDifficulty;
  status?: TopicStatus;
  revisionCount?: number;
  lastRevised?: Date | null;
  confidence?: number;
  isWeakArea?: boolean;
  prerequisites?: string[];
  /** Optional Notion mirror — local wins on merge when a row already exists. */
  nextRevisionAt?: Date | null;
  sm2Interval?: number;
  sm2Repetition?: number;
  sm2Efactor?: number;
}

export interface NotionProblem {
  id: string;
  name: string;
  topicId?: string;
  difficulty?: TopicDifficulty;
  leetcodeLink?: string;
  status?: ProblemStatus;
  attempts?: number;
  timeTaken?: number;
  notes?: string;
}

export interface NotionSession {
  id: string;
  date: Date;
  topicId?: string;
  problemsSolved?: number;
  studyDuration?: number;
  productivityScore?: number;
}
