import * as d3 from "d3";
import { useEffect, useRef } from "react";
import { EmptyState, SparkleIcon } from "./EmptyState.js";
import type { Topic } from "../types/api.js";

interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  name: string;
  confidence: number;
  status: Topic["status"];
  isWeakArea: boolean;
  isDue: boolean;
}

type GraphLink = d3.SimulationLinkDatum<GraphNode>;

interface Props {
  topics: Topic[];
  /** Node click → side panel with stats and "study this now" (5.4). */
  onNodeClick?: (topicId: string) => void;
}

/* CSS variables so the graph follows the active theme. */
const GRAPH_COLORS = {
  mastered: "var(--success)",
  inProgress: "var(--warning)",
  notStarted: "var(--text-subtle)",
  weakArea: "var(--danger)",
} as const;

function nodeColor(node: GraphNode): string {
  if (node.isWeakArea) return GRAPH_COLORS.weakArea;
  if (node.status === "Mastered") return GRAPH_COLORS.mastered;
  if (node.status === "In progress") return GRAPH_COLORS.inProgress;
  return GRAPH_COLORS.notStarted;
}

function nodeRadius(node: GraphNode): number {
  return 8 + (node.confidence / 100) * 10;
}

export function KnowledgeGraph({ topics, onNodeClick }: Props) {
  const ref = useRef<SVGSVGElement>(null);
  const fitRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!ref.current || topics.length === 0) return;

    const width = ref.current.clientWidth || 720;
    const height = 480;
    const now = Date.now();

    const nodes: GraphNode[] = topics.map((t) => ({
      id: t.id,
      name: t.name,
      confidence: t.confidence,
      status: t.status,
      isWeakArea: t.isWeakArea,
      isDue:
        t.status !== "Not started" &&
        (t.nextRevisionAt == null || new Date(t.nextRevisionAt).getTime() <= now),
    }));

    const nodeIds = new Set(nodes.map((n) => n.id));
    const links: GraphLink[] = [];

    for (const topic of topics) {
      for (const prereqId of topic.prerequisites) {
        if (nodeIds.has(prereqId)) {
          links.push({ source: prereqId, target: topic.id } as GraphLink);
        }
      }
    }

    const svg = d3.select(ref.current);
    svg.selectAll("*").remove();
    svg.attr("viewBox", `0 0 ${width} ${height}`);

    const g = svg.append("g");

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.25, 4])
      .on("zoom", (event) => {
        g.attr("transform", event.transform.toString());
      });

    svg.call(zoom);

    /** Zoom/pan so every node (plus its label) is visible. Applied without a
     * transition: rAF-driven animations stall in background tabs and would
     * leave the viewport in a half-applied state. */
    const fitView = () => {
      const xs = nodes.map((n) => n.x ?? 0);
      const ys = nodes.map((n) => n.y ?? 0);
      if (xs.length === 0) return;
      // Labels extend right of the node; pad generously on that side.
      const pad = 40;
      const minX = Math.min(...xs) - pad;
      const maxX = Math.max(...xs) + pad + 90;
      const minY = Math.min(...ys) - pad;
      const maxY = Math.max(...ys) + pad;
      const boundsW = Math.max(maxX - minX, 1);
      const boundsH = Math.max(maxY - minY, 1);
      const scale = Math.min(1.5, 0.95 / Math.max(boundsW / width, boundsH / height));
      const tx = width / 2 - scale * (minX + boundsW / 2);
      const ty = height / 2 - scale * (minY + boundsH / 2);
      svg.call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
    };
    fitRef.current = fitView;

    // Collision radius covers the node plus a slice of its right-hand label —
    // enough to stop label pile-ups without inflating the layout.
    const collideRadius = (d: GraphNode) =>
      Math.min(nodeRadius(d) + 8 + d.name.length * 1.9, 68);

    const simulation = d3
      .forceSimulation(nodes)
      .force(
        "link",
        d3
          .forceLink<GraphNode, GraphLink>(links)
          .id((d) => d.id)
          .distance(95),
      )
      .force("charge", d3.forceManyBody().strength(-160))
      .force("center", d3.forceCenter(width / 2, height / 2))
      // Gentle gravity shaped to the wide canvas: stronger on y so the
      // cloud spreads horizontally instead of ballooning vertically.
      .force("x", d3.forceX(width / 2).strength(0.045))
      .force("y", d3.forceY(height / 2).strength(0.16))
      .force("collision", d3.forceCollide<GraphNode>().radius(collideRadius).strength(0.8));

    // Settle most of the layout synchronously so the first paint is already
    // organized and can be fitted right away.
    simulation.tick(90);

    const link = g
      .append("g")
      .attr("stroke", "var(--border)")
      .attr("stroke-opacity", 0.9)
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke-width", 1.5);

    const drag = d3
      .drag<SVGGElement, GraphNode>()
      .on("start", (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
        event.sourceEvent.stopPropagation();
      })
      .on("drag", (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on("end", (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });

    const node = g
      .append("g")
      .selectAll<SVGGElement, GraphNode>("g")
      .data(nodes)
      .join("g")
      .call(drag);

    // Highlighted ring marks topics with due revisions (5.4).
    node
      .filter((d) => d.isDue)
      .append("circle")
      .attr("r", (d) => nodeRadius(d) + 5)
      .attr("fill", "none")
      .attr("stroke", "var(--accent)")
      .attr("stroke-width", 2)
      .attr("stroke-dasharray", "4 3")
      .attr("opacity", 0.9);

    node
      .append("circle")
      .attr("r", (d) => nodeRadius(d))
      .attr("fill", (d) => nodeColor(d))
      .attr("stroke", "var(--bg-card)")
      .attr("stroke-width", 2)
      .style("cursor", "pointer")
      .on("click", (event, d) => {
        event.stopPropagation();
        onNodeClick?.(d.id);
      });

    node
      .append("text")
      .attr("class", "graph-node-label")
      .text((d) => d.name)
      .attr("x", (d) => nodeRadius(d) + 6)
      .attr("y", 4);

    node.append("title").text(
      (d) => `${d.name}\n${d.status} · ${d.confidence}% confidence`,
    );

    const linkNode = (endpoint: GraphLink["source"]): GraphNode => {
      return typeof endpoint === "object" ? endpoint : nodes.find((n) => n.id === endpoint)!;
    };

    simulation.on("tick", () => {
      link
        .attr("x1", (d) => linkNode(d.source).x ?? 0)
        .attr("y1", (d) => linkNode(d.source).y ?? 0)
        .attr("x2", (d) => linkNode(d.target).x ?? 0)
        .attr("y2", (d) => linkNode(d.target).y ?? 0);

      node.attr("transform", (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });

    // First paint is pre-settled (tick warm-up above), so fit immediately.
    fitView();

    return () => {
      simulation.stop();
      svg.on(".zoom", null);
      fitRef.current = null;
    };
  }, [topics, onNodeClick]);

  if (topics.length === 0) {
    return (
      <div className="card">
        <EmptyState
          icon={<SparkleIcon />}
          title="No topics to visualize"
          hint="Topics appear here once they're synced from Notion."
        />
      </div>
    );
  }

  return (
    <div className="graph-container card">
      <button
        type="button"
        className="btn btn-ghost graph-fit-btn"
        onClick={() => fitRef.current?.()}
        title="Fit all topics in view"
      >
        ⊡ Fit view
      </button>
      <svg ref={ref} className="chart-svg" style={{ minHeight: 480 }} />
      <div className="graph-legend">
        <span><i style={{ background: GRAPH_COLORS.mastered }} /> Mastered</span>
        <span><i style={{ background: GRAPH_COLORS.inProgress }} /> In progress</span>
        <span><i style={{ background: GRAPH_COLORS.notStarted }} /> Not started</span>
        <span><i style={{ background: GRAPH_COLORS.weakArea }} /> Weak area</span>
        <span><i style={{ background: "transparent", border: "2px dashed var(--accent)" }} /> Revision due</span>
      </div>
    </div>
  );
}
