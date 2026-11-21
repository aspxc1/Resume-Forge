import { useEffect, useRef, type ReactNode } from 'react'
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, X } from 'lucide-react'
import { tracks, type Track } from './model'

export function SortableList<T extends { id: string }>({ rows, reorder, children }: {
  rows: T[]; reorder: (rows: T[]) => void; children: (row: T, grip: ReactNode) => ReactNode
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  return <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={({ active, over }) => {
    if (!over || active.id === over.id) return
    const from = rows.findIndex((row) => row.id === active.id)
    const to = rows.findIndex((row) => row.id === over.id)
    if (from >= 0 && to >= 0) reorder(arrayMove(rows, from, to))
  }}>
    <SortableContext items={rows} strategy={verticalListSortingStrategy}>
      {rows.map((row) => <SortableRow key={row.id} id={row.id}>{(grip) => children(row, grip)}</SortableRow>)}
    </SortableContext>
  </DndContext>
}

function SortableRow({ id, children }: { id: string; children: (grip: ReactNode) => ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id })
  return <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, position: 'relative', zIndex: isDragging ? 2 : undefined }}>
    {children(<button type="button" className="grip" ref={setActivatorNodeRef} {...attributes} {...listeners} aria-label="Drag to reorder" title="Drag to reorder"><GripVertical size={15} /></button>)}
  </div>
}

export function TrackPicker({ selected, change }: { selected: Track[]; change: (tracks: Track[]) => void }) {
  return <div className="flex flex-wrap gap-2">{tracks.map((track) =>
    <button type="button" key={track} className={selected.includes(track) ? 'chip selected' : 'chip'} aria-pressed={selected.includes(track)}
      onClick={() => change(selected.includes(track) ? selected.filter((value) => value !== track) : [...selected, track])}>{track}</button>
  )}</div>
}

export function Modal({ title, close, children, wide = false }: { title: string; close: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    ref.current?.showModal()
  }, [])
  return <dialog ref={ref} className={wide ? 'modal wide' : 'modal'} aria-label={title} onCancel={(e) => { e.preventDefault(); close() }}>
    <div className="modal-header"><h2>{title}</h2><button className="icon-button" title="Close" aria-label="Close" onClick={close}><X size={18}/></button></div>
    <div className="modal-content">{children}</div>
  </dialog>
}
