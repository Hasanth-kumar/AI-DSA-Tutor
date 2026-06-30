import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client.js";
import { SessionTracker } from "../components/SessionTracker.js";
import { usePolling } from "../hooks/usePolling.js";
import { PageHeader } from "../components/PageHeader.js";
import type { Problem, Topic } from "../types/api.js";

const SESSION_POLL_MS = 30_000;

export function SessionPage() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [staticError, setStaticError] = useState<string | null>(null);

  const loadStatic = useCallback(async () => {
    try {
      const [t, p] = await Promise.all([api.getTopics(), api.getProblems()]);
      setTopics(t.topics);
      setProblems(p.problems);
      setStaticError(null);
    } catch (err) {
      setStaticError(err instanceof Error ? err.message : "Failed to load data");
    }
  }, []);

  useEffect(() => {
    void loadStatic();
  }, [loadStatic]);

  const fetchSessions = useCallback(
    () => api.getSessions(30).then((res) => res.sessions),
    [],
  );

  const {
    data: sessions,
    error: sessionError,
    refresh: refreshSessions,
  } = usePolling(fetchSessions, SESSION_POLL_MS, { initialLoading: true });

  const onLogged = useCallback(() => {
    void refreshSessions();
    void loadStatic();
  }, [refreshSessions, loadStatic]);

  const error = staticError ?? sessionError;

  return (
    <div className="page-content page-content--session">
      <PageHeader
        eyebrow="Live session"
        title="Focused study"
        align="center"
      />
      {error && <div className="error-banner">{error}</div>}
      <SessionTracker
        topics={topics}
        problems={problems}
        sessions={sessions ?? []}
        onLogged={onLogged}
      />
    </div>
  );
}
