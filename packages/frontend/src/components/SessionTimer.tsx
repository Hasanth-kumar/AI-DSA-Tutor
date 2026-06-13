import { useEffect, useState, type MutableRefObject } from "react";

function formatTimer(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

interface Props {
  elapsedRef: MutableRefObject<number>;
  onReset?: () => void;
  onElapsedChange?: (seconds: number) => void;
}

export function SessionTimer({ elapsedRef, onReset, onElapsedChange }: Props) {
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    elapsedRef.current = elapsed;
    onElapsedChange?.(elapsed);
  }, [elapsed, elapsedRef, onElapsedChange]);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  const handleReset = () => {
    setRunning(false);
    setElapsed(0);
    elapsedRef.current = 0;
    onReset?.();
  };

  const minutesElapsed = Math.floor(elapsed / 60);

  return (
    <>
      <div className="timer-area">
        <div className="timer-label">
          {running ? "Session in progress" : elapsed > 0 ? "Paused" : "Ready to start"}
        </div>
        <div className="timer-display" style={{ margin: "0.5rem 0" }}>
          {formatTimer(elapsed)}
        </div>
        {minutesElapsed > 0 && (
          <div className="timer-elapsed-hint">{minutesElapsed} min elapsed</div>
        )}
      </div>

      <div className="btn-row" style={{ justifyContent: "center" }}>
        {!running ? (
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => setRunning(true)}
            style={{ minWidth: "90px" }}
          >
            {elapsed > 0 ? "Resume" : "Start"}
          </button>
        ) : (
          <button
            className="btn"
            type="button"
            onClick={() => setRunning(false)}
            style={{ minWidth: "90px" }}
          >
            Pause
          </button>
        )}
        {elapsed > 0 && (
          <button className="btn btn-ghost" type="button" onClick={handleReset}>
            Reset
          </button>
        )}
      </div>
    </>
  );
}
