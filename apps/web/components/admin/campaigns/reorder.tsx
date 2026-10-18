'use client';

import { ArrowDown, ArrowUp, GripVertical } from 'lucide-react';
import { DragEvent, useEffect, useRef, useState } from 'react';
import { clsx } from '@/components/ui';

export function move<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

const iconBtn =
  'inline-flex size-8 items-center justify-center rounded-md text-ink-soft hover:bg-black/5 hover:text-ink disabled:pointer-events-none disabled:opacity-30';

/**
 * Up / down buttons for keyboard-friendly reordering. Focus follows the row it moved,
 * and hops to the other arrow when the row reaches the top or bottom.
 */
export function MoveButtons({ index, count, label, onMove }: { index: number; count: number; label: string; onMove: (to: number) => void }) {
  const up = useRef<HTMLButtonElement>(null);
  const down = useRef<HTMLButtonElement>(null);
  const pending = useRef<'up' | 'down' | null>(null);

  useEffect(() => {
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    const target = p === 'up' ? (index === 0 ? down : up) : index === count - 1 ? up : down;
    target.current?.focus();
  }, [index, count]);

  return (
    <span className="inline-flex shrink-0 items-center">
      <button
        ref={up}
        type="button"
        className={iconBtn}
        disabled={index === 0}
        aria-label={`Move ${label} up`}
        title="Move up"
        onClick={() => {
          pending.current = 'up';
          onMove(index - 1);
        }}
      >
        <ArrowUp className="size-4" aria-hidden />
      </button>
      <button
        ref={down}
        type="button"
        className={iconBtn}
        disabled={index === count - 1}
        aria-label={`Move ${label} down`}
        title="Move down"
        onClick={() => {
          pending.current = 'down';
          onMove(index + 1);
        }}
      >
        <ArrowDown className="size-4" aria-hidden />
      </button>
    </span>
  );
}

/**
 * Optional mouse drag-and-drop on top of the arrow buttons. Only the grip handle starts a drag,
 * so text inputs in the row keep working normally.
 */
export function useDragSort(onMove: (from: number, to: number) => void) {
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);

  const handle = (index: number) => ({
    draggable: true,
    onDragStart: (e: DragEvent<HTMLElement>) => {
      setDragging(index);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(index));
      const row = (e.currentTarget as HTMLElement).closest('[data-sort-row]');
      if (row instanceof HTMLElement) e.dataTransfer.setDragImage(row, 16, 16);
    },
    onDragEnd: () => {
      setDragging(null);
      setOver(null);
    },
  });

  const row = (index: number) => ({
    'data-sort-row': true,
    onDragOver: (e: DragEvent<HTMLElement>) => {
      if (dragging === null) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (over !== index) setOver(index);
    },
    onDrop: (e: DragEvent<HTMLElement>) => {
      if (dragging === null) return;
      e.preventDefault();
      onMove(dragging, index);
      setDragging(null);
      setOver(null);
    },
    className: clsx(dragging === index && 'opacity-50', over === index && dragging !== null && dragging !== index && 'outline-2 -outline-offset-2 outline-dashed outline-marigold'),
  });

  return { handle, row };
}

export function DragHandle(props: ReturnType<ReturnType<typeof useDragSort>['handle']>) {
  return (
    <span {...props} className="hidden cursor-grab items-center text-ink-faint hover:text-ink-soft active:cursor-grabbing sm:inline-flex" aria-hidden title="Drag to reorder">
      <GripVertical className="size-4" />
    </span>
  );
}
