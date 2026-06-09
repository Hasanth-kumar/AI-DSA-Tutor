/** Default sequential study order — finish all problems in a topic before advancing. */
export const DEFAULT_CURRICULUM_TOPICS = [
  "Binary Search",
  "Trees",
  "Heaps",
  "Graphs",
  "Sliding Window",
  "Backtracking",
  "Greedy",
  "DP",
  "Tries",
  "Union Find",
  "Monotonic Stack",
  "Segment Tree",
] as const;

/** Short labels → canonical topic names in Notion / mirror DB. */
export const TOPIC_NAME_ALIASES: Record<string, string[]> = {
  "Binary Search": ["Binary Search"],
  Trees: ["Trees", "Tree DFS", "Tree BFS", "Binary Search Tree"],
  Heaps: ["Heaps", "Heap", "Priority Queue"],
  Graphs: ["Graphs", "Graph DFS", "Graph BFS"],
  "Sliding Window": ["Sliding Window"],
  Backtracking: ["Backtracking"],
  Greedy: ["Greedy"],
  DP: ["DP", "Dynamic Programming"],
  Tries: ["Tries", "Trie"],
  "Union Find": ["Union Find", "Disjoint Set", "Union-Find"],
  "Monotonic Stack": ["Monotonic Stack"],
  "Segment Tree": ["Segment Tree", "Segment Trees"],
};
