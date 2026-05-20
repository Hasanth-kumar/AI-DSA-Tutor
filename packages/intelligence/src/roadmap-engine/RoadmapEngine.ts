import type { PrerequisiteViolation, TopicState } from "../types.js";
import { TopicDAG } from "./dag.js";
import { DSA_PREREQUISITES } from "./dsa-roadmap.js";

export class RoadmapEngine {
  private readonly dag = new TopicDAG();

  /** Register edges from topic prerequisite lists. */
  registerTopics(topics: TopicState[]): void {
    for (const topic of topics) {
      for (const prereqId of topic.prerequisites) {
        this.dag.addEdge(prereqId, topic.id);
      }
    }
  }

  /** Match canonical DSA names to topic IDs when names align. */
  registerTopicsByName(topics: TopicState[]): void {
    const nameToId = new Map(topics.map((t) => [t.name, t.id]));
    for (const [prereq, topic] of DSA_PREREQUISITES) {
      const from = nameToId.get(prereq);
      const to = nameToId.get(topic);
      if (from && to) this.dag.addEdge(from, to);
    }
    this.registerTopics(topics);
  }

  isUnlocked(topic: TopicState, allTopics: TopicState[]): boolean {
    const mastered = new Set(
      allTopics.filter((t) => t.status === "Mastered").map((t) => t.id),
    );

    const directOk = topic.prerequisites.every((id) => mastered.has(id));
    if (!directOk) return false;

    return this.dag.isUnlocked(topic.id, mastered);
  }

  getUnlockedTopics(topics: TopicState[]): TopicState[] {
    return topics.filter((t) => this.isUnlocked(t, topics));
  }

  findPrerequisiteViolations(topics: TopicState[]): PrerequisiteViolation[] {
    const topicMap = new Map(topics.map((t) => [t.id, t]));
    const mastered = new Set(
      topics.filter((t) => t.status === "Mastered").map((t) => t.id),
    );

    const violations: PrerequisiteViolation[] = [];

    for (const topic of topics) {
      if (topic.status === "Not started") continue;

      const required = [
        ...new Set([...topic.prerequisites, ...this.dag.getAllPrerequisites(topic.id)]),
      ];
      const missing = required.filter((id) => !mastered.has(id));

      if (missing.length > 0) {
        violations.push({
          topicId: topic.id,
          topicName: topic.name,
          missingPrerequisites: missing.map(
            (id) => topicMap.get(id)?.name ?? id,
          ),
        });
      }
    }

    return violations;
  }

  hasCycle(): boolean {
    return this.dag.hasCycle();
  }

  getAllPrerequisites(topicId: string): string[] {
    return this.dag.getAllPrerequisites(topicId);
  }
}
