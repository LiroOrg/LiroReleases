import type { ReactNode } from 'react'

export interface FolderIconDef {
  id: string
  label: string
  path: string
}

export const FOLDER_ICONS: FolderIconDef[] = [
  { id: 'folder', label: 'Папка', path: 'M3 6.5A1.5 1.5 0 0 1 4.5 5h4l2 2.2h7A1.5 1.5 0 0 1 19 8.7v8.8a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 3 17.5z' },
  { id: 'star', label: 'Звезда', path: 'M12 3.6l2.5 5.1 5.6.8-4 3.9 1 5.6-5.1-2.7-5 2.7 1-5.6-4.1-3.9 5.6-.8z' },
  { id: 'flag', label: 'Флаг', path: 'M6 3v18M6 4.5h11l-2.2 3.5L17 11.5H6' },
  { id: 'book', label: 'Книга', path: 'M4 4.5h7a2.5 2.5 0 0 1 2.5 2.5v12a2 2 0 0 0-2-1.6H4zM20 4.5h-4.5A2.5 2.5 0 0 0 13 7v12a2 2 0 0 1 2-1.6h5z' },
  { id: 'briefcase', label: 'Портфель', path: 'M3.5 8.5h17v10a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5zM9 8.5V6.8A1.3 1.3 0 0 1 10.3 5.5h3.4A1.3 1.3 0 0 1 15 6.8v1.7M3.5 12.5h17' },
  { id: 'tag', label: 'Метка', path: 'M3.8 11.2l7.4-7.4h8.4v8.4l-7.4 7.4zM16.2 7.4h.01' },
  { id: 'clock', label: 'Часы', path: 'M12 4.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15zM12 8v4.3l3 1.7' },
  { id: 'heart', label: 'Сердце', path: 'M12 19.5S4 14.8 4 9.8A4.3 4.3 0 0 1 12 7.4a4.3 4.3 0 0 1 8 2.4c0 5-8 9.7-8 9.7z' },
  { id: 'archive', label: 'Архив', path: 'M3.5 6.5h17v3.5h-17zM5 10v8.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V10M10 13.5h4' },
  { id: 'code', label: 'Код', path: 'M9 7.5L4.5 12 9 16.5M15 7.5L19.5 12 15 16.5M13.5 4.5l-3 15' },
  { id: 'camera', label: 'Камера', path: 'M3.5 8.5h3.7l1.6-2.4h6.4l1.6 2.4h3.7v10h-17zM12 10.8a2.9 2.9 0 1 0 0 5.8 2.9 2.9 0 0 0 0-5.8z' },
  { id: 'target', label: 'Цель', path: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 11.2a.8.8 0 1 0 0 1.6.8.8 0 0 0 0-1.6z' },
  { id: 'layers', label: 'Слои', path: 'M12 3.5l8.5 4.3L12 12 3.5 7.8zM3.5 12.2L12 16.5l8.5-4.3M3.5 16.4L12 20.7l8.5-4.3' },
  { id: 'pin', label: 'Закреп', path: 'M9 3.5h6l-1 5.2 3.3 3.3H6.7L10 8.7zM12 12v8.5' },
  { id: 'user', label: 'Команда', path: 'M12 4.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8zM4.8 20a7.2 7.2 0 0 1 14.4 0' },
  { id: 'spark', label: 'Идея', path: 'M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9zM18.5 16l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z' },
  { id: 'flask', label: 'Опыт', path: 'M9.5 3.5v6.2L4.8 18.2A1.8 1.8 0 0 0 6.4 20.8h11.2a1.8 1.8 0 0 0 1.6-2.6l-4.7-8.5V3.5M8.5 3.5h7M7.4 14.5h9.2' },
  { id: 'compass', label: 'Направление', path: 'M12 3.8a8.2 8.2 0 1 0 0 16.4 8.2 8.2 0 0 0 0-16.4zM15.4 8.6l-1.9 5-5 1.9 1.9-5z' },
  { id: 'calendar', label: 'Календарь', path: 'M4.5 6.5h15v13A1.5 1.5 0 0 1 18 21H6a1.5 1.5 0 0 1-1.5-1.5zM4.5 10.5h15M8.5 4v4M15.5 4v4' },
  { id: 'chat', label: 'Обсуждение', path: 'M4 6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5v8a1.5 1.5 0 0 1-1.5 1.5H10l-4.5 3.5v-3.5h0A1.5 1.5 0 0 1 4 14.5z' },
  { id: 'grid', label: 'Сетка', path: 'M4.5 4.5h6v6h-6zM13.5 4.5h6v6h-6zM4.5 13.5h6v6h-6zM13.5 13.5h6v6h-6z' },
  { id: 'shield', label: 'Безопасность', path: 'M12 3.5l7 2.6v5.2c0 4.3-2.9 7.7-7 9.2-4.1-1.5-7-4.9-7-9.2V6.1z' },
  { id: 'rocket', label: 'Запуск', path: 'M12 3.5c3 2.2 4.5 5.5 4.5 9.2l-2.4 2.3H9.9L7.5 12.7C7.5 9 9 5.7 12 3.5zM9.9 15 8 21l3-1.7 1.6 1.7.6-4.4M12 10.5a1 1 0 1 0 0 2 1 1 0 0 0 0-2z' },
  { id: 'music', label: 'Звук', path: 'M9 18V6.6l10-2v11M9 18a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0zM19 15.6a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z' },
  { id: 'map', label: 'Карта', path: 'M9 4.2 3.5 6.4v13.4L9 17.6l6 2.2 5.5-2.2V4.2L15 6.4zM9 4.2v13.4M15 6.4v13.4' },
  { id: 'zap', label: 'Быстро', path: 'M13.5 3.5 6 13.5h5l-1.5 7 7.5-10h-5z' }
]

export const FOLDER_COLORS = [
  '#0d0d0f',
  '#3f3f46',
  '#71717a',
  '#a1a1aa',
  '#7f1d1d',
  '#b91c1c',
  '#c2410c',
  '#b45309',
  '#a16207',
  '#4d7c0f',
  '#15803d',
  '#047857',
  '#0f766e',
  '#0e7490',
  '#1d4ed8',
  '#4338ca',
  '#6d28d9',
  '#7e22ce',
  '#a21caf',
  '#be185d'
]

export function folderIconPath(id: string | undefined): string {
  const found = FOLDER_ICONS.find((entry) => entry.id === id)
  if (found) return found.path
  return FOLDER_ICONS[0].path
}

export function folderIconImageUrl(projectId: string | undefined, stamp?: string): string | null {
  if (!projectId) return null
  return `lirofile://folder/${encodeURIComponent(projectId)}.png${stamp ? `?v=${stamp}` : ''}`
}

export function FolderIcon(props: {
  project?: { id?: string; icon?: string; glyph?: string; iconColor?: string; hasIconImage?: boolean }
  size?: number
}): ReactNode {
  const size = props.size ?? 16
  const color = props.project?.iconColor ?? 'currentColor'
  if (props.project?.hasIconImage) {
    return (
      <img
        className="foldericon foldericon--photo"
        width={size}
        height={size}
        src={folderIconImageUrl(props.project.id) ?? ''}
        alt=""
        draggable={false}
      />
    )
  }
  const glyph = props.project?.glyph?.trim()
  if (glyph) {
    return (
      <span className="foldericon foldericon--glyph" style={{ fontSize: size * 0.95, color }}>
        {glyph.slice(0, 2)}
      </span>
    )
  }
  return (
    <svg
      className="foldericon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={folderIconPath(props.project?.icon)} />
    </svg>
  )
}