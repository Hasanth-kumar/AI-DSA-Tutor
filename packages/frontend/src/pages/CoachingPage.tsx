import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { api } from "../api/client.js";
import type { ChatMessage, HealthInfo, Problem } from "../types/api.js";

const THREAD_STORAGE_KEY = "dsa-coach-thread-id";

interface Props {
  /** Pre-anchor the chat to a problem (1.2) — set when arriving from Today. */
  anchorProblemId?: string | null;
}

const STARTER_PROMPTS = [
  "Why is BFS better than DFS for shortest path in an unweighted graph?",
  "Walk me through how to approach interval merging problems.",
  "What am I weak at this week and how should I practice?",
];

function CoachIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="white" width="28" height="28">
      <path d="M8 1L2 4.5v5L8 13l6-3.5v-5L8 1zm0 2.2l3.8 2.2L8 7.6 4.2 5.4 8 3.2zM3.5 6.8L7 8.7V11L3.5 9V6.8zm5 4.2V8.7l3.5-1.9V9L8.5 11z" />
    </svg>
  );
}

function AssistantAvatar() {
  return (
    <div className="coach-avatar coach-avatar--assistant" aria-hidden>
      <svg viewBox="0 0 16 16" fill="white">
        <path d="M8 1L2 4.5v5L8 13l6-3.5v-5L8 1zm0 2.2l3.8 2.2L8 7.6 4.2 5.4 8 3.2zM3.5 6.8L7 8.7V11L3.5 9V6.8zm5 4.2V8.7l3.5-1.9V9L8.5 11z" />
      </svg>
    </div>
  );
}

function UserAvatar() {
  return (
    <div className="coach-avatar coach-avatar--user" aria-hidden>
      You
    </div>
  );
}

export function CoachingPage({ anchorProblemId }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [problemId, setProblemId] = useState("");
  const [includeContext, setIncludeContext] = useState(true);
  const [directMode, setDirectMode] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [llmDown, setLlmDown] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Anchor handed in from the Today view (1.2).
  useEffect(() => {
    if (anchorProblemId) setProblemId(anchorProblemId);
  }, [anchorProblemId]);

  // Graceful degradation (5.4): disable the coach with a clear message when
  // the LLM is unreachable instead of failing on send.
  useEffect(() => {
    let cancelled = false;
    void api
      .getFullHealth()
      .then((health: HealthInfo) => {
        if (!cancelled) setLlmDown(health.services?.ollama.status === "down");
      })
      .catch(() => {
        /* health probe is best-effort */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const anchoredProblem = problemId
    ? problems.find((p) => p.id === problemId) ?? null
    : null;

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const res = await api.getProblems();
        setProblems(res.problems);
        const savedId = sessionStorage.getItem(THREAD_STORAGE_KEY);
        if (savedId) {
          const thread = await api.getChatThread(savedId);
          setThreadId(thread.threadId);
          setMessages(thread.messages);
        }
      } catch (err) {
        sessionStorage.removeItem(THREAD_STORAGE_KEY);
        setError(err instanceof Error ? err.message : "Failed to load coach");
      } finally {
        setBootstrapping(false);
      }
    })();
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, loading, scrollToBottom]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  }, [input]);

  const handleNewChat = async () => {
    if (threadId) {
      try { await api.clearChatThread(threadId); } catch { /* gone */ }
    }
    sessionStorage.removeItem(THREAD_STORAGE_KEY);
    setThreadId(null);
    setMessages([]);
    setError(null);
    textareaRef.current?.focus();
  };

  const handleSend = async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;
    setLoading(true);
    setError(null);
    if (!text) setInput("");
    try {
      const result = await api.sendChatMessage({
        threadId: threadId ?? undefined,
        message: msg,
        problemId: problemId || undefined,
        includeContext,
        directMode,
      });
      setThreadId(result.threadId);
      sessionStorage.setItem(THREAD_STORAGE_KEY, result.threadId);
      setMessages((prev) => [...prev, result.userMessage, result.assistantMessage]);
    } catch (err) {
      if (!text) setInput(msg);
      setError(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setLoading(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const isEmpty = !bootstrapping && messages.length === 0;

  return (
    <div className="coach-layout">

      {/* ── Settings bar ── */}
      <div className="coach-settings-bar">
        <span className="coach-settings-title">Coach</span>
        <div className="coach-setting-sep" />

        <label className="coach-option">
          <input
            type="checkbox"
            checked={includeContext}
            onChange={(e) => setIncludeContext(e.target.checked)}
          />
          My learning context
        </label>

        <label className="coach-option">
          <input
            type="checkbox"
            checked={directMode}
            onChange={(e) => setDirectMode(e.target.checked)}
          />
          Direct explanations
        </label>

        <div className="coach-setting-sep" />

        <select
          className="coach-select"
          value={problemId}
          onChange={(e) => setProblemId(e.target.value)}
          aria-label="Problem context"
        >
          <option value="">No problem selected</option>
          {problems.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>

        <button
          type="button"
          className="coach-new-btn"
          onClick={() => void handleNewChat()}
        >
          <svg viewBox="0 0 14 14" fill="currentColor" width="12" height="12">
            <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none"/>
          </svg>
          New chat
        </button>
      </div>

      {/* ── Anchored-problem chip (1.2) ── */}
      {anchoredProblem && (
        <div className="coach-anchor-bar">
          <span className="coach-anchor-chip">
            anchored to: <strong>{anchoredProblem.name}</strong>
            <button
              type="button"
              aria-label="Detach problem"
              title="Detach problem"
              onClick={() => setProblemId("")}
            >
              ✕
            </button>
          </span>
          <span className="muted" style={{ fontSize: "0.75rem" }}>
            Coach sees this problem&apos;s history, your mistakes and notes — hints
            escalate only when you ask.
          </span>
        </div>
      )}

      {/* ── Thread ── */}
      <div className="coach-thread">
        <div className="coach-thread-inner">

          {bootstrapping && (
            <div style={{ padding: "3rem 0", textAlign: "center", color: "var(--text-muted)", fontSize: "0.9rem" }}>
              Loading…
            </div>
          )}

          {isEmpty && (
            <div className="coach-welcome">
              <div className="coach-welcome-icon">
                <CoachIcon />
              </div>
              <h2 className="coach-welcome-heading">What would you like to learn?</h2>
              <p className="coach-welcome-sub">
                Ask about algorithms, get hints on problems, or have your weak areas explained.
              </p>
              <div className="coach-prompts">
                {STARTER_PROMPTS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className="coach-prompt-btn"
                    onClick={() => void handleSend(p)}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) =>
            msg.role === "user" ? (
              <div key={msg.id} className="coach-msg-row coach-msg-row--user">
                <UserAvatar />
                <div className="coach-msg-body">
                  <div className="coach-user-bubble">{msg.content}</div>
                </div>
              </div>
            ) : (
              <div key={msg.id} className="coach-msg-row">
                <AssistantAvatar />
                <div className="coach-msg-body">
                  <div className="coach-sender-name">Coach</div>
                  <div className="coach-assistant-text">{msg.content}</div>
                </div>
              </div>
            )
          )}

          {loading && (
            <div className="coach-msg-row">
              <AssistantAvatar />
              <div className="coach-msg-body">
                <div className="coach-sender-name">Coach</div>
                <div className="coach-thinking">
                  <span /><span /><span />
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* ── Composer ── */}
      <div className="coach-composer-wrap">
        {llmDown && (
          <div className="error-banner coach-error">
            Coach is disabled — the LLM is unreachable. Start it with{" "}
            <code>pnpm study</code> (Ollama) or check your OpenRouter key, then reload.
          </div>
        )}
        {error && (
          <div className="error-banner coach-error">{error}</div>
        )}
        <div className="coach-composer-inner">
          <textarea
            ref={textareaRef}
            value={input}
            rows={1}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={llmDown ? "Coach unavailable — LLM is down" : "Ask a DSA question…"}
            disabled={loading || bootstrapping || llmDown}
          />
          <button
            type="button"
            className="coach-send-btn"
            onClick={() => void handleSend()}
            disabled={loading || bootstrapping || llmDown || !input.trim()}
            title="Send (Enter)"
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="8" y1="13" x2="8" y2="3" />
              <polyline points="4,7 8,3 12,7" />
            </svg>
          </button>
        </div>
        <div className="coach-composer-hint">
          Enter to send · Shift+Enter for newline
        </div>
      </div>

    </div>
  );
}
