import { DifficultyEngine } from "../difficulty-engine/DifficultyEngine.js";
import { RoadmapEngine } from "../roadmap-engine/RoadmapEngine.js";
import { RevisionEngine } from "../revision-engine/RevisionEngine.js";
import { TopicPriorityEngine } from "../topic-priority-engine/TopicPriorityEngine.js";
import type {
  IntelligenceSnapshot,
  IntelligenceUpdate,
  PlanOptions,
  SessionSnapshot,
  StudyPlan,
  TopicState,
} from "../types.js";
import { WeaknessEngine } from "../weakness-engine/WeaknessEngine.js";

export class IntelligenceOrchestrator {
  constructor(
    private readonly topicPriority: TopicPriorityEngine,
    private readonly revision: RevisionEngine,
    private readonly weakness: WeaknessEngine,
    private readonly difficulty: DifficultyEngine,
    private readonly roadmap: RoadmapEngine,
  ) {}

  generatePlan(topics: TopicState[], options: PlanOptions = {}): StudyPlan {
    this.roadmap.registerTopicsByName(topics);
    const unlocked = this.roadmap.getUnlockedTopics(topics);
    const withScores = this.topicPriority.scoreAll(unlocked);

    if (withScores.length === 0) {
      throw new Error("No unlocked topics available for planning");
    }

    const difficultyRec = this.difficulty.recommendDifficulty(
      withScores[0].topic,
    );
    return this.topicPriority.buildPlan(withScores, difficultyRec, options);
  }

  generateDailyPlan(topics: TopicState[], options?: PlanOptions): StudyPlan {
    return this.generatePlan(topics, options);
  }

  updateAfterSession(
    topic: TopicState,
    session: SessionSnapshot,
  ): IntelligenceUpdate {
    const sm2 = this.revision.updateAfterSession(topic, session);
    const weaknessUpdate = this.weakness.analyzeWeakness({
      ...topic,
      recentSessions: [...topic.recentSessions, session],
    });
    return { sm2, weaknessUpdate };
  }

  getRevisionQueue(topics: TopicState[]): TopicState[] {
    return this.revision.getRevisionQueue(topics);
  }

  getWeaknessReport(topics: TopicState[]) {
    return this.weakness.detectAllWeaknesses(topics);
  }

  buildSnapshot(topics: TopicState[]): IntelligenceSnapshot {
    this.roadmap.registerTopicsByName(topics);
    const unlocked = this.roadmap.getUnlockedTopics(topics);
    const topicScores = this.topicPriority
      .scoreAll(topics)
      .map((s) => s.score);
    const revisionQueue = this.getRevisionQueue(topics);
    const weaknessReport = this.getWeaknessReport(topics);
    const prerequisiteViolations =
      this.roadmap.findPrerequisiteViolations(topics);

    const summary = [
      `${unlocked.length}/${topics.length} topics unlocked.`,
      `${revisionQueue.length} due for revision.`,
      `${weaknessReport.weakTopics.length} weak areas.`,
      prerequisiteViolations.length > 0
        ? `${prerequisiteViolations.length} prerequisite violations.`
        : "No prerequisite violations.",
    ].join(" ");

    return {
      generatedAt: new Date(),
      topicScores,
      revisionQueue,
      weaknessReport,
      prerequisiteViolations,
      unlockedTopicIds: unlocked.map((t) => t.id),
      summary,
    };
  }
}

export function createIntelligenceOrchestrator(): IntelligenceOrchestrator {
  const revision = new RevisionEngine();
  const weakness = new WeaknessEngine();
  const difficulty = new DifficultyEngine();
  const roadmap = new RoadmapEngine();
  const topicPriority = new TopicPriorityEngine(revision);

  return new IntelligenceOrchestrator(
    topicPriority,
    revision,
    weakness,
    difficulty,
    roadmap,
  );
}
