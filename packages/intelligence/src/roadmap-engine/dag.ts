/** Directed acyclic graph: edge from → to means `from` must be mastered before `to`. */
export class TopicDAG {
  private graph = new Map<string, Set<string>>();

  addEdge(from: string, to: string): void {
    if (!this.graph.has(from)) this.graph.set(from, new Set());
    this.graph.get(from)!.add(to);
  }

  getAllPrerequisites(topicId: string): string[] {
    const visited = new Set<string>();

    const traverse = (id: string): void => {
      for (const [prereq, targets] of this.graph) {
        if (targets.has(id) && !visited.has(prereq)) {
          visited.add(prereq);
          traverse(prereq);
        }
      }
    };

    traverse(topicId);
    return [...visited];
  }

  isUnlocked(topicId: string, masteredTopics: Set<string>): boolean {
    const prereqs = this.getAllPrerequisites(topicId);
    return prereqs.every((p) => masteredTopics.has(p));
  }

  hasCycle(): boolean {
    const visited = new Set<string>();
    const recStack = new Set<string>();

    const dfs = (node: string): boolean => {
      visited.add(node);
      recStack.add(node);
      for (const neighbor of this.graph.get(node) ?? []) {
        if (!visited.has(neighbor) && dfs(neighbor)) return true;
        if (recStack.has(neighbor)) return true;
      }
      recStack.delete(node);
      return false;
    };

    for (const node of this.graph.keys()) {
      if (!visited.has(node) && dfs(node)) return true;
    }
    return false;
  }

  getDirectDependents(topicId: string): string[] {
    const result: string[] = [];
    for (const [from, targets] of this.graph) {
      if (from === topicId) result.push(...targets);
    }
    return result;
  }
}
