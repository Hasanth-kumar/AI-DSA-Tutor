import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { api } from "../api/client.js";
import { CoachMarkdown } from "../components/CoachMarkdown.js";
import { CopyButton } from "../components/CopyButton.js";
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

function visibleStarterPrompts(input: string): string[] {
  const query = input.trim().toLowerCase();
  if (!query) return STARTER_PROMPTS;
  return STARTER_PROMPTS.filter((p) => p.toLowerCase().startsWith(query));
}

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

function CoachGenerating() {
  return (
    <div
      className="coach-generating"
      role="status"
      aria-live="polite"
      aria-label="Coach is generating a response"
    >
      <div className="coach-thinking" aria-hidden>
        <span /><span /><span />
      </div>
      <span className="coach-generating-label">Coach is thinking…</span>
    </div>
  );
}

function SendIcon({ loading }: { loading: boolean }) {
  if (loading) {
    return (
      <svg className="coach-send-spinner" viewBox="0 0 16 16" fill="none" aria-hidden>
        <circle cx="8" cy="8" r="6" stroke="white" strokeWidth="2" strokeOpacity="0.25" />
        <path
          d="M14 8a6 6 0 0 0-6-6"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="8" y1="13" x2="8" y2="3" />
      <polyline points="4,7 8,3 12,7" />
    </svg>
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
  const [composerFocused, setComposerFocused] = useState(false);
  const [promptsOpen, setPromptsOpen] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stickToBottomRef = useRef(true);

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

  const onThreadScroll = useCallback(() => {
    const el = threadRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distanceFromBottom < 96;
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    bottomRef.current?.scrollIntoView({ behavior });
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

  useEffect(() => {
    if (!stickToBottomRef.current) return;
    scrollToBottom(loading ? "auto" : "smooth");
  }, [messages, loading, scrollToBottom]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  }, [input]);

  const handleNewChat = async () => {
    if (loading) return;
    if (threadId) {
      try { await api.clearChatThread(threadId); } catch { /* gone */ }
    }
    sessionStorage.removeItem(THREAD_STORAGE_KEY);
    setThreadId(null);
    setMessages([]);
    setError(null);
    setPromptsOpen(false);
    textareaRef.current?.focus();
  };

  const handleSend = async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;

    const optimisticId = `pending-${Date.now()}`;
    const optimisticUser: ChatMessage = {
      id: optimisticId,
      role: "user",
      content: msg,
      createdAt: new Date().toISOString(),
    };

    stickToBottomRef.current = true;
    setMessages((prev) => [...prev, optimisticUser]);
    setLoading(true);
    setError(null);
    if (!text) setInput("");
    setComposerFocused(false);
    setPromptsOpen(false);

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
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== optimisticId),
        result.userMessage,
        result.assistantMessage,
      ]);
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      if (!text) setInput(msg);
      setError(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setLoading(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape" && promptsOpen) {
      e.preventDefault();
      setPromptsOpen(false);
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const isEmpty = !bootstrapping && messages.length === 0 && !loading;
  const filteredPrompts = visibleStarterPrompts(input);
  const showPrompts =
    isEmpty && promptsOpen && !loading && !llmDown && filteredPrompts.length > 0;

  const handleComposerInnerClick = () => {
    if (loading || bootstrapping || llmDown) return;
    setPromptsOpen(true);
    textareaRef.current?.focus();
  };

  const handleComposerFocus = () => {
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = null;
    }
    setComposerFocused(true);
  };

  const handleComposerBlur = () => {
    blurTimeoutRef.current = setTimeout(() => {
      setComposerFocused(false);
      setPromptsOpen(false);
    }, 150);
  };

  useEffect(() => {
    return () => {
      if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
    };
  }, []);

  const composer = (
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
      <div
        className={`coach-composer-inner${loading ? " coach-composer-inner--busy" : ""}${promptsOpen ? " coach-composer-inner--prompts-open" : ""}`}
        onClick={handleComposerInnerClick}
      >
        <textarea
          ref={textareaRef}
          value={input}
          rows={1}
          onChange={(e) => setInput(e.target.value)}
          onFocus={handleComposerFocus}
          onBlur={handleComposerBlur}
          onKeyDown={onKeyDown}
          placeholder={llmDown ? "Coach unavailable — LLM is down" : "Ask a DSA question…"}
          disabled={loading || bootstrapping || llmDown}
        />
        <button
          type="button"
          className={`coach-send-btn${loading ? " coach-send-btn--loading" : ""}`}
          onClick={() => void handleSend()}
          disabled={loading || bootstrapping || llmDown || !input.trim()}
          title={loading ? "Generating response…" : "Send (Enter)"}
          aria-label={loading ? "Generating response" : "Send message"}
        >
          <SendIcon loading={loading} />
        </button>
      </div>
      {showPrompts && (
        <div className="coach-composer-prompts" role="listbox" aria-label="Suggested questions">
          {filteredPrompts.map((p) => (
            <button
              key={p}
              type="button"
              role="option"
              className="coach-prompt-btn"
              onMouseDown={(e) => e.preventDefault()}
              disabled={loading}
              onClick={() => void handleSend(p)}
            >
              <span className="coach-prompt-btn__text">{p}</span>
              <span className="coach-prompt-btn__icon" aria-hidden>
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="3" y1="8" x2="13" y2="8" />
                  <polyline points="9,4 13,8 9,12" />
                </svg>
              </span>
            </button>
          ))}
        </div>
      )}
      {composerFocused && (
        <div className="coach-composer-hint">
          Enter to send · Shift+Enter for newline
        </div>
      )}
    </div>
  );

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
          <span>My learning context</span>
        </label>

        <label className="coach-option">
          <input
            type="checkbox"
            checked={directMode}
            onChange={(e) => setDirectMode(e.target.checked)}
          />
          <span>Direct explanations</span>
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
          <span className="muted text-xs">
            Coach sees this problem&apos;s history, your mistakes and notes — hints
            escalate only when you ask.
          </span>
        </div>
      )}

      {isEmpty ? (
        <div className="coach-empty-state">
          <div className="coach-empty-state-inner">
            <div className="coach-welcome">
              <div className="coach-welcome-icon">
                <CoachIcon />
              </div>
              <h2 className="coach-welcome-heading">What would you like to learn?</h2>
              <p className="coach-welcome-sub">
                Ask about algorithms, get hints on problems, or have your weak areas explained.
              </p>
            </div>
            {composer}
          </div>
        </div>
      ) : (
        <div className={`coach-conversation${loading ? " coach-conversation--generating" : ""}`}>
          <div
            className="coach-thread"
            ref={threadRef}
            onScroll={onThreadScroll}
            aria-busy={loading}
          >
            <div className="coach-thread-inner">
              {bootstrapping && (
                <div className="coach-thinking coach-thinking--centered" aria-label="Loading chat">
                  <span /><span /><span />
                </div>
              )}

              {messages.map((msg) =>
                msg.role === "user" ? (
                  <div key={msg.id} className="coach-msg-row coach-msg-row--user">
                    <UserAvatar />
                    <div className="coach-msg-body">
                      <div className="coach-user-turn">
                        <div className="coach-user-bubble">{msg.content}</div>
                        <div className="coach-msg-actions">
                          <CopyButton text={msg.content} title="Copy message" />
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div key={msg.id} className="coach-msg-row coach-msg-row--assistant">
                    <AssistantAvatar />
                    <div className="coach-msg-body">
                      <CoachMarkdown content={msg.content} />
                    </div>
                  </div>
                )
              )}

              {loading && (
                <div className="coach-msg-row coach-msg-row--assistant coach-msg-row--generating">
                  <AssistantAvatar />
                  <div className="coach-msg-body">
                    <CoachGenerating />
                  </div>
                </div>
              )}

              <div ref={bottomRef} className="coach-thread-anchor" aria-hidden />
            </div>
          </div>
          {composer}
        </div>
      )}

    </div>
  );
}
