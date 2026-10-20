import { useEffect, useRef, useState } from 'react';
import type { Peer } from '@/lib/types';

interface CursorOverlayProps {
  peers: Peer[];
  editorSelector: string;
}

interface PositionedCursor {
  peer: Peer;
  top: number;
  left: number;
  labelWidth: number;
}

function measureLabel(name: string): number {
  return Math.max(40, name.length * 7 + 16);
}

export default function CursorOverlay({ peers, editorSelector }: CursorOverlayProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorElRef = useRef<HTMLElement | null>(null);
  const [cursors, setCursors] = useState<PositionedCursor[]>([]);
  const [hidden, setHidden] = useState(false);

  // Locate the editor's scroll container once
  useEffect(() => {
    function attach() {
      const container = containerRef.current?.parentElement;
      if (!container) return;
      const editorEl = container.querySelector(editorSelector) as HTMLElement | null;
      editorElRef.current = editorEl ?? null;
      if (!editorEl) {
        requestAnimationFrame(attach);
      }
    }
    attach();
  }, [editorSelector]);

  useEffect(() => {
    if (hidden) return;

    function compute() {
      const container = containerRef.current?.parentElement;
      const editorEl = editorElRef.current;
      if (!container || !editorEl) return;
      const containerRect = container.getBoundingClientRect();

      const next: PositionedCursor[] = [];
      for (const peer of peers) {
        if (!peer.cursor) continue;

        // Locate line + col DOM nodes inside Monaco
        const lineEl = editorEl.querySelector<HTMLElement>(`.view-line[data-line-number="${peer.cursor.lineNumber}"]`);
        if (!lineEl) continue;

        const lineRect = lineEl.getBoundingClientRect();
        // Approximate column offset by character width
        const span = lineEl.querySelector('span') as HTMLElement | null;
        const charWidth = span ? span.getBoundingClientRect().width / Math.max(span.textContent?.length ?? 1, 1) : 8;
        const x = lineRect.left - containerRect.left + (peer.cursor.column - 1) * charWidth;
        const y = lineRect.top - containerRect.top;

        next.push({ peer, top: y, left: x, labelWidth: measureLabel(peer.displayName) });
      }
      setCursors(next);
    }

    compute();

    // Recompute on scroll within the editor area
    const editorEl = editorElRef.current;
    if (!editorEl) {
      const id = requestAnimationFrame(compute);
      return () => cancelAnimationFrame(id);
    }
    const scrollContainer = editorEl.querySelector('.editor-scrollable') as HTMLElement | null;
    scrollContainer?.addEventListener('scroll', compute);
    const ro = new ResizeObserver(compute);
    ro.observe(editorEl);
    return () => {
      scrollContainer?.removeEventListener('scroll', compute);
      ro.disconnect();
    };
  }, [peers, hidden]);

  // If the container isn't positioned relative, the cursors would drift; hide during resizes
  useEffect(() => {
    const parent = containerRef.current?.parentElement;
    if (parent && getComputedStyle(parent).position === 'static') {
      parent.style.position = 'relative';
    }
  }, []);

  if (hidden) return null;

  return (
    <div ref={containerRef} className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      {cursors.map((c) => (
        <div
          key={c.peer.userId}
          className="absolute transition-all duration-75 ease-out"
          style={{ top: c.top, left: c.left }}
        >
          {/* Caret */}
          <div
            className="w-0.5 h-5 rounded-sm"
            style={{ backgroundColor: c.peer.color, boxShadow: `0 0 4px ${c.peer.color}` }}
          />
          {/* Name flag */}
          <div
            className="absolute top-5 left-0 px-1.5 py-0.5 rounded text-[10px] font-medium text-white whitespace-nowrap shadow-md"
            style={{ backgroundColor: c.peer.color, minWidth: c.labelWidth }}
          >
            {c.peer.displayName}
          </div>
        </div>
      ))}
    </div>
  );
}
