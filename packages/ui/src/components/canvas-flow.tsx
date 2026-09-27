"use client";

import {
  Background,
  BackgroundVariant,
  Handle,
  Position,
  ReactFlow,
  useStore,
  type Edge,
  type EdgeProps,
  type EdgeTypes,
  type Node,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import { useCallback, useRef } from "react";

import { cn } from "../lib/cn";

import { CanvasEdge, type CanvasSide } from "./canvas-edge";
import { CanvasGroup, type CanvasGroupData } from "./canvas-group";
import { CanvasNode, type CanvasService } from "./canvas-node";
import { VolumeChip, type CanvasVolume } from "./volume-chip";

export interface ServiceNodeData extends Record<string, unknown> {
  service: CanvasService;
  selected?: boolean;
  multiSelected?: boolean;
  serverOffline?: boolean;
  /** Reference time for relative dates, so static scenes render the same every time. */
  now?: number;
}

export interface GroupNodeData extends Record<string, unknown> {
  group: CanvasGroupData;
  serviceCount: number;
  selected?: boolean;
}

export interface VolumeNodeData extends Record<string, unknown> {
  volume: CanvasVolume;
  selected?: boolean;
}

export interface ReferenceEdgeData extends Record<string, unknown> {
  variables: string[];
  dimmed?: boolean;
  hovered?: boolean;
  targetOffset?: number;
}

export type CanvasFlowNode =
  Node<ServiceNodeData, "service"> | Node<GroupNodeData, "group"> | Node<VolumeNodeData, "volume">;

export type CanvasFlowEdge = Edge<ReferenceEdgeData, "reference">;

const SIDE: Record<Position, CanvasSide> = {
  [Position.Left]: "left",
  [Position.Right]: "right",
  [Position.Top]: "top",
  [Position.Bottom]: "bottom",
};

function ServiceFlowNode({ data }: NodeProps<Node<ServiceNodeData, "service">>) {
  return (
    <>
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <CanvasNode
        service={data.service}
        selected={data.selected ?? false}
        multiSelected={data.multiSelected ?? false}
        serverOffline={data.serverOffline ?? false}
        {...(data.now === undefined ? {} : { now: data.now })}
      />
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </>
  );
}

function GroupFlowNode({ data, width, height }: NodeProps<Node<GroupNodeData, "group">>) {
  return (
    <CanvasGroup
      group={data.group}
      serviceCount={data.serviceCount}
      width={width ?? 0}
      height={height ?? 0}
      selected={data.selected ?? false}
    />
  );
}

function VolumeFlowNode({ data }: NodeProps<Node<VolumeNodeData, "volume">>) {
  return <VolumeChip volume={data.volume} attached={false} selected={data.selected ?? false} />;
}

function ReferenceFlowEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  data,
}: EdgeProps<CanvasFlowEdge>) {
  return (
    <CanvasEdge
      from={{ x: sourceX, y: sourceY }}
      to={{ x: targetX, y: targetY }}
      fromSide={SIDE[sourcePosition]}
      toSide={SIDE[targetPosition]}
      variables={data?.variables ?? []}
      selected={selected === true}
      hovered={data?.hovered ?? false}
      dimmed={data?.dimmed ?? false}
      targetOffset={data?.targetOffset ?? 0}
    />
  );
}

// Stable module-level maps: React Flow re-mounts every node when these change identity.
const NODE_TYPES: NodeTypes = {
  service: ServiceFlowNode,
  group: GroupFlowNode,
  volume: VolumeFlowNode,
};

const EDGE_TYPES: EdgeTypes = {
  reference: ReferenceFlowEdge,
};

/**
 * The 8 px grid only above 60 % zoom: below that its lines crowd into a haze
 * and repainting the dense pattern on every pan frame costs frames.
 */
function FineGrid() {
  const visible = useStore((state) => state.transform[2] >= 0.6);
  if (!visible) {
    return null;
  }
  return (
    <Background
      id="fine"
      variant={BackgroundVariant.Lines}
      gap={8}
      lineWidth={1}
      color="var(--color-grid)"
    />
  );
}

export interface CanvasFlowProps {
  nodes: CanvasFlowNode[];
  edges: CanvasFlowEdge[];
  /** Accessible name of the canvas region. */
  label?: string;
  /** Height in px; the width follows the container. */
  height?: number;
  /** Centre the scene on first render (default true), at 100 % zoom. */
  fitView?: boolean;
  /** Allow panning and zooming (default true). Nodes are never draggable in Phase 1. */
  interactive?: boolean;
  /**
   * Mount only the nodes and edges in view (default true). Large canvases pan
   * without mounting work; small ones may turn it off.
   */
  onlyRenderVisible?: boolean;
  className?: string;
}

/**
 * A static project canvas: Lumen's service, volume and group nodes and
 * reference edges inside React Flow, on the 8 px instrument grid with a 96 px
 * major grid. Pan and zoom work; editing (drag, connect, select) is Phase 05.
 * Only elements in view are rendered, so 100 services stay at 60 fps.
 */
export function CanvasFlow({
  nodes,
  edges,
  label = "Project canvas",
  height = 480,
  fitView = true,
  interactive = true,
  onlyRenderVisible = true,
  className,
}: CanvasFlowProps) {
  // Edge flow pauses while the viewport moves: repainting dozens of animated
  // dashes on top of a moving layer is what cost frames when panning (see
  // docs/evidence/phase-01/perf). Toggled on the DOM so no re-render happens.
  const sectionRef = useRef<HTMLElement>(null);
  const setMoving = useCallback((moving: boolean) => {
    sectionRef.current?.toggleAttribute("data-moving", moving);
  }, []);

  return (
    <section
      ref={sectionRef}
      aria-label={label}
      className={cn("border-border rounded-card w-full overflow-hidden border", className)}
      style={{ height }}
      data-canvas-flow=""
    >
      <ReactFlow
        className="lumen-canvas"
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        fitView={fitView}
        // The first view never shrinks below 100 %: every control keeps its 24 px target
        // (WCAG 2.5.8) and text stays readable. Larger scenes are centred; pan to explore.
        fitViewOptions={{ padding: 0.12, minZoom: 1, maxZoom: 1 }}
        minZoom={0.2}
        maxZoom={2}
        nodesDraggable={false}
        nodesConnectable={false}
        nodesFocusable={false}
        edgesFocusable={false}
        elementsSelectable={false}
        panOnDrag={interactive}
        zoomOnScroll={interactive}
        zoomOnPinch={interactive}
        zoomOnDoubleClick={false}
        preventScrolling={interactive}
        onlyRenderVisibleElements={onlyRenderVisible}
        disableKeyboardA11y
        onMoveStart={() => {
          setMoving(true);
        }}
        onMoveEnd={() => {
          setMoving(false);
        }}
      >
        <FineGrid />
        <Background
          id="major"
          variant={BackgroundVariant.Lines}
          gap={96}
          lineWidth={1}
          color="var(--color-grid-major)"
        />
      </ReactFlow>
    </section>
  );
}
