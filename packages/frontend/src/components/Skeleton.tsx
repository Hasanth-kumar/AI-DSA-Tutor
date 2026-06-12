import type { CSSProperties } from "react";

interface SkeletonProps {
  variant?: "text" | "title" | "stat" | "block" | "row";
  width?: string | number;
  height?: string | number;
  style?: CSSProperties;
}

/** Shimmering placeholder block; shape comes from the variant or width/height. */
export function Skeleton({ variant = "text", width, height, style }: SkeletonProps) {
  return (
    <div
      className={`skeleton skeleton-${variant}`}
      style={{ width, height, ...style }}
      aria-hidden="true"
    />
  );
}

/** A row of stat-card-shaped skeletons (Overview top row). */
export function SkeletonStatCards({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-4" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="card">
          <Skeleton variant="text" width="50%" />
          <Skeleton variant="stat" />
          <Skeleton variant="text" width="70%" />
        </div>
      ))}
    </div>
  );
}

/** A card holding a chart-sized skeleton block. */
export function SkeletonChartCard({ height = 180 }: { height?: number }) {
  return (
    <div className="card" aria-hidden="true">
      <Skeleton variant="title" />
      <Skeleton variant="block" height={height} />
    </div>
  );
}

/** A card holding stacked list-row skeletons. */
export function SkeletonListCard({ rows = 3 }: { rows?: number }) {
  return (
    <div className="card" aria-hidden="true">
      <Skeleton variant="title" />
      <SkeletonRows rows={rows} />
    </div>
  );
}

/** Bare list-row skeletons for use inside an existing card. */
export function SkeletonRows({ rows = 3 }: { rows?: number }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} variant="row" />
      ))}
    </div>
  );
}

/** Bare text-line skeletons for small inline loading areas. */
export function SkeletonLines({ lines = 2 }: { lines?: number }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} variant="text" width={`${85 - i * 18}%`} />
      ))}
    </div>
  );
}

/** Full-page fallback for lazy-loaded tabs (App Suspense). */
export function SkeletonPage() {
  return (
    <div aria-busy="true">
      <header className="page-header">
        <div className="page-header-text" style={{ width: "100%" }}>
          <Skeleton variant="title" width={180} height={28} />
          <Skeleton variant="text" width={300} />
        </div>
      </header>
      <div className="grid">
        <SkeletonStatCards />
        <SkeletonListCard rows={3} />
      </div>
    </div>
  );
}
