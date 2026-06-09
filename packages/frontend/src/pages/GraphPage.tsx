import { lazy, Suspense, useEffect, useState } from "react";
import { api } from "../api/client.js";
import type { Topic } from "../types/api.js";

const KnowledgeGraph = lazy(() =>
  import("../components/KnowledgeGraph.js").then((m) => ({
    default: m.KnowledgeGraph,
  })),
);

export function GraphPage() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getTopics()
      .then((res) => setTopics(res.topics))
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load topics"),
      );
  }, []);

  return (
    <div>
      <header className="page-header">
        <div className="page-header-text">
          <h2>Knowledge graph</h2>
          <p>Topics as nodes — color shows mastery, edges show prerequisites.</p>
        </div>
      </header>
      {error && <div className="error-banner">{error}</div>}
      <Suspense
        fallback={
          <div className="card">
            <p className="muted" style={{ margin: 0 }}>Loading graph…</p>
          </div>
        }
      >
        <KnowledgeGraph topics={topics} />
      </Suspense>
    </div>
  );
}
