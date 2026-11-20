import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TournamentSponsor } from '@/services/api/admin-management';

function nameOf(items: readonly TournamentSponsor[], id: string | number): string {
  return items.find((item) => item.id === id)?.name ?? '';
}

function positionOf(items: readonly TournamentSponsor[], id: string | number): number {
  return items.findIndex((item) => item.id === id) + 1;
}

/** Vertical sortable list; dropping onto another sponsor reports that sponsor's position. */
export function SortableSponsorList({
  items,
  disabled,
  onMove,
  children,
}: {
  readonly items: readonly TournamentSponsor[];
  readonly disabled: boolean;
  readonly onMove: (sponsor: TournamentSponsor, targetDisplayIndex: number) => void;
  readonly children: ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Đã chọn ${nameOf(items, active.id)} để di chuyển.`,
    onDragOver: ({ active, over }) =>
      over
        ? `${nameOf(items, active.id)} đang ở vị trí thứ ${String(positionOf(items, over.id))}.`
        : undefined,
    onDragEnd: ({ active, over }) =>
      over
        ? `Đã thả ${nameOf(items, active.id)} vào vị trí thứ ${String(positionOf(items, over.id))}.`
        : `Đã thả ${nameOf(items, active.id)}.`,
    onDragCancel: ({ active }) => `Đã hủy di chuyển ${nameOf(items, active.id)}.`,
  };
  function onDragEnd({ active, over }: DragEndEvent): void {
    if (!over || active.id === over.id) return;
    const sponsor = items.find((item) => item.id === active.id);
    const target = items.find((item) => item.id === over.id);
    if (sponsor && target) onMove(sponsor, target.displayIndex);
  }
  return (
    <DndContext
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable:
            'Nhấn Space hoặc Enter để chọn, dùng phím mũi tên để di chuyển, nhấn Space hoặc Enter lần nữa để thả, Esc để hủy.',
        },
      }}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
      sensors={sensors}
    >
      <SortableContext
        disabled={disabled}
        items={items.map((item) => item.id)}
        strategy={verticalListSortingStrategy}
      >
        <ul className="grid gap-3">{children}</ul>
      </SortableContext>
    </DndContext>
  );
}

/** One sortable row; `children` receives the drag handle to place inside the row. */
export function SortableSponsorItem({
  sponsor,
  className,
  showHandle,
  children,
}: {
  readonly sponsor: TournamentSponsor;
  readonly className?: string;
  readonly showHandle: boolean;
  readonly children: (handle: ReactNode) => ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: sponsor.id });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const handle = showHandle ? (
    <button
      {...attributes}
      {...(listeners as HTMLAttributes<HTMLButtonElement>)}
      aria-label={`Kéo để đổi vị trí ${sponsor.name}`}
      className="flex size-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-4 focus-visible:ring-primary/25 active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50"
      ref={setActivatorNodeRef}
      title="Kéo để đổi vị trí"
      type="button"
    >
      <GripVertical aria-hidden="true" className="size-5" />
    </button>
  ) : null;
  return (
    <li
      className={cn(className, isDragging && 'relative z-10 border-primary/40 shadow-lg')}
      ref={setNodeRef}
      style={style}
    >
      {children(handle)}
    </li>
  );
}
