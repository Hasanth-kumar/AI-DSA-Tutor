import type { TopicDifficulty, TopicStatus } from "@dsa/database/notion-types";

import type { ProblemStatus } from "@dsa/database/notion-types";

export interface TopicNotionUpdate {
  confidence?: number;
  revisionCount?: number;
  lastRevised?: Date;
  isWeakArea?: boolean;
  status?: TopicStatus;
  difficulty?: TopicDifficulty;
  /** Optional transparency mirrors — not authoritative for scheduling. */
  nextRevisionAt?: Date | null;
  sm2Interval?: number;
  sm2Efactor?: number;
}

export interface SessionNotionCreate {
  date: Date;
  topicId: string;
  problemsSolved: number;
  studyDuration: number;
  productivityScore: number;
}

export interface ProblemNotionUpdate {
  status?: ProblemStatus;
  attempts?: number;
  timeTaken?: number;
}
