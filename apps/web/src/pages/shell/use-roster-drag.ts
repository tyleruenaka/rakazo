import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

/** Grok's pointer threshold: a press becomes a drag once it moves this far. */
const DRAG_START_PX = 6;
/** How long the pointer rests on a bot before a drop nests under it. */
export const NEST_HOLD_MS = 600;
const AUTO_SCROLL_EDGE_PX = 40;
const AUTO_SCROLL_MAX_PX = 12;

export type RosterDragPoint = { x: number; y: number };

/**
 * Pointer drag for the bot list. The ghost follows the pointer through `ghostRef`
 * without re-rendering the list. `locate` runs on every move with the row held
 * long enough to nest, if any, and returns the row the pointer is resting on so
 * the hold can be timed. Mouse and pen only, so touch keeps scrolling the list.
 */
export function useRosterDrag(options: {
  scrollRef: RefObject<HTMLElement | null>;
  locate: (botId: string, point: RosterDragPoint, heldKey: string | null) => string | null;
  drop: (botId: string) => void;
  end: () => void;
}) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const ghostRef = useRef<HTMLDivElement | null>(null);
  const pointRef = useRef<RosterDragPoint>({ x: 0, y: 0 });
  const latest = useRef(options);
  latest.current = options;
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => () => stopRef.current?.(), []);

  const onPointerDown = useCallback(
    (botId: string) => (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0 || event.pointerType === "touch" || stopRef.current) return;
      const start = { x: event.clientX, y: event.clientY };
      const source = event.currentTarget;
      let dragging = false;
      // Edge scrolling waits until the pointer has been outside the edge zone, so a drag that
      // starts near the edge doesn't slide the grabbed row away before the pointer moves.
      let scrollArmed = false;
      let restingKey: string | null = null;
      let heldKey: string | null = null;
      let holdTimer = 0;
      let scrollFrame = 0;

      const locate = () => {
        const resting = latest.current.locate(botId, pointRef.current, heldKey);
        if (resting === restingKey) return;
        restingKey = resting;
        heldKey = null;
        window.clearTimeout(holdTimer);
        if (!resting) return;
        holdTimer = window.setTimeout(() => {
          heldKey = resting;
          latest.current.locate(botId, pointRef.current, heldKey);
        }, NEST_HOLD_MS);
      };
      const autoScroll = () => {
        scrollFrame = 0;
        const list = latest.current.scrollRef.current;
        if (!list) return;
        const box = list.getBoundingClientRect();
        const point = pointRef.current;
        if (point.x < box.left || point.x > box.right) return;
        const step = (distance: number) =>
          Math.ceil((1 - Math.max(0, distance) / AUTO_SCROLL_EDGE_PX) * AUTO_SCROLL_MAX_PX);
        const delta =
          point.y < box.top + AUTO_SCROLL_EDGE_PX
            ? -step(point.y - box.top)
            : point.y > box.bottom - AUTO_SCROLL_EDGE_PX
              ? step(box.bottom - point.y)
              : 0;
        if (!delta) {
          scrollArmed = true;
          return;
        }
        if (!scrollArmed) return;
        const before = list.scrollTop;
        list.scrollTop += delta;
        if (list.scrollTop === before) return;
        locate();
        scrollFrame = window.requestAnimationFrame(autoScroll);
      };

      const move = (moveEvent: PointerEvent) => {
        if (moveEvent.pointerId !== event.pointerId) return;
        const point = { x: moveEvent.clientX, y: moveEvent.clientY };
        pointRef.current = point;
        if (!dragging) {
          if (Math.hypot(point.x - start.x, point.y - start.y) < DRAG_START_PX) return;
          dragging = true;
          document.getSelection()?.removeAllRanges();
          setDraggedId(botId);
        }
        moveEvent.preventDefault();
        placeGhost(ghostRef.current, point);
        locate();
        if (!scrollFrame) scrollFrame = window.requestAnimationFrame(autoScroll);
      };
      const stop = () => {
        window.clearTimeout(holdTimer);
        window.cancelAnimationFrame(scrollFrame);
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", stop);
        window.removeEventListener("keydown", key, true);
        window.removeEventListener("blur", stop);
        stopRef.current = null;
        if (!dragging) return;
        setDraggedId(null);
        latest.current.end();
      };
      const up = (upEvent: PointerEvent) => {
        if (upEvent.pointerId !== event.pointerId) return;
        if (dragging) {
          // The click that follows the release must not open the chat.
          const swallow = (click: MouseEvent) => {
            click.preventDefault();
            click.stopPropagation();
          };
          window.addEventListener("click", swallow, { capture: true, once: true });
          window.setTimeout(() => window.removeEventListener("click", swallow, true));
          latest.current.drop(botId);
        }
        stop();
      };
      const key = (keyEvent: KeyboardEvent) => {
        if (keyEvent.key !== "Escape" || !dragging) return;
        keyEvent.preventDefault();
        keyEvent.stopPropagation();
        // Esc ends a mouse gesture; it must not leave the row with a keyboard focus ring.
        source.blur();
        stop();
      };

      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", stop);
      window.addEventListener("keydown", key, true);
      window.addEventListener("blur", stop);
      stopRef.current = stop;
    },
    [],
  );

  // The ghost mounts with the drag; put it under the pointer before it paints.
  const ghostMount = useCallback((node: HTMLDivElement | null) => {
    ghostRef.current = node;
    placeGhost(node, pointRef.current);
  }, []);

  return { draggedId, ghostRef: ghostMount, onPointerDown };
}

function placeGhost(ghost: HTMLElement | null, point: RosterDragPoint) {
  if (ghost) ghost.style.transform = `translate(${point.x}px, ${point.y}px)`;
}
