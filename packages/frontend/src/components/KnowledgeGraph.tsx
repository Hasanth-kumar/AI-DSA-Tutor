import * as d3 from "d3";
import { useEffect, useRef } from "react";
import type { Topic } from "../types/api.js";

interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  name: string;
  confidence: number;
  status: Topic["status"];
  isWeakArea: boolean;
}

type GraphLink = d3.SimulationLinkDatum<GraphNode>;

interface Props {
  topics: Topic[];
}

function nodeColor(node: GraphNode): string {
  if (node.isWeakArea) return "#e87070";
  if (node.status === "Mastered") return "#52c88a";
  if (node.status === "In progress") return "#d4713e";
  return "#3a3530";
}

export function KnowledgeGraph({ topics }: Props) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!ref.current || topics.length === 0) return;

    const width = ref.current.clientWidth || 720;
    const height = 480;

    const nodes: GraphNode[] = topics.map((t) => ({
      id: t.id,
      name: t.name,
      confidence: t.confidence,
      status: t.status,
      isWeakArea: t.isWeakArea,
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

    const simulation = d3
      .forceSimulation(nodes)
      .force(
        "link",
        d3
          .forceLink<GraphNode, GraphLink>(links)
          .id((d) => d.id)
          .distance(90),
      )
      .force("charge", d3.forceManyBody().strength(-280))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide(28));

    const link = g
      .append("g")
      .attr("stroke", "#38332c")
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

    node
      .append("circle")
      .attr("r", (d) => 8 + (d.confidence / 100) * 10)
      .attr("fill", (d) => nodeColor(d))
      .attr("stroke", "#1a1918")
      .attr("stroke-width", 2)
      .style("cursor", "grab");

    node
      .append("text")
      .text((d) => d.name)
      .attr("x", 14)
      .attr("y", 4)
      .attr("fill", "#f2ebe0")
      .attr("font-size", "11px")
      .attr("font-family", "Inter, system-ui, sans-serif")
      .style("pointer-events", "none")
      .style("user-select", "none");

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

    return () => {
      simulation.stop();
      svg.on(".zoom", null);
    };
  }, [topics]);

  if (topics.length === 0) {
    return <p className="muted">No topics to visualize.</p>;
  }

  return (
    <div className="graph-container card">
      <h3>Knowledge graph</h3>
      <svg ref={ref} className="chart-svg" style={{ minHeight: 480 }} />
      <div className="graph-legend">
        <span><i style={{ background: "#52c88a", borderRadius: "50%", width: 9, height: 9, display: "inline-block" }} /> Mastered</span>
        <span><i style={{ background: "#d4713e", borderRadius: "50%", width: 9, height: 9, display: "inline-block" }} /> In progress</span>
        <span><i style={{ background: "#3a3530", borderRadius: "50%", width: 9, height: 9, display: "inline-block", border: "1px solid #5c5348" }} /> Not started</span>
        <span><i style={{ background: "#e87070", borderRadius: "50%", width: 9, height: 9, display: "inline-block" }} /> Weak area</span>
        <span className="muted" style={{ marginLeft: "auto" }}>Node size = confidence · Scroll to zoom · Drag nodes or background to pan</span>
      </div>
    </div>
  );
}
