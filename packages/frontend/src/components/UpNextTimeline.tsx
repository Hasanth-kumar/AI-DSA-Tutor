import type { CurriculumItem } from "../types/api.js";

export function UpNextTimeline({
  items,
  startIndex,
}: {
  items: CurriculumItem[];
  startIndex: number;
}) {
  const visible = items.slice(0, 3);
  return (
    <div className="up-next-list">
      {visible.map((item, i) => {
        const isNow = item.status === "current";
        const isLocked = item.status === "missing";
        return (
          <div key={`${item.name}-${i}`} className="up-next-item">
            <span className="up-next-index" aria-hidden>
              {String(startIndex + i + 1).padStart(2, "0")}
            </span>
            <span className={`up-next-name${isNow ? "" : " up-next-name--muted"}`}>
              {item.name}
            </span>
            <span className={`up-next-tag${isNow ? " up-next-tag--now" : ""}`}>
              {isNow
                ? "NOW"
                : isLocked
                  ? "locked"
                  : item.topicId && item.totalCount === 0
                    ? "no problems"
                    : item.unsolvedCount > 0
                      ? `${item.unsolvedCount} left`
                      : "up next"}
            </span>
          </div>
        );
      })}
    </div>
  );
}
