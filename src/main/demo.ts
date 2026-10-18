import { uid } from '@shared/util'
import type { BoardDoc } from '@shared/types'
import { buildDoc, commitDoc } from './import/commit'
import { store } from './store'

const sampleImage =
  'data:image/svg+xml;base64,' +
  btoaSafe(
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400"><rect width="640" height="400" fill="#f4f4f5"/><g fill="#d4d4d8"><rect x="40" y="40" width="180" height="120" rx="8"/><rect x="250" y="40" width="180" height="120" rx="8"/><rect x="460" y="40" width="140" height="120" rx="8"/><rect x="40" y="200" width="260" height="160" rx="8"/><rect x="340" y="200" width="260" height="160" rx="8"/></g><g fill="#a1a1aa" font-family="sans-serif" font-size="18"><text x="58" y="108">Диаграмма</text><text x="268" y="108">Схема</text><text x="478" y="108">Данные</text><text x="58" y="290">Отчёт</text><text x="358" y="290">График</text></g></svg>`
  )

function btoaSafe(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64')
}

const cluster = (
  baseX: number,
  baseY: number,
  colors: string[],
  texts: string[]
): unknown[] =>
  texts.map((text, index) => ({
    id: uid('demo_sticky_'),
    type: 'sticky_note',
    x: baseX + (index % 3) * 230,
    y: baseY + Math.floor(index / 3) * 220,
    width: 200,
    height: 200,
    origin: 'center',
    relativeTo: 'canvas_center',
    style: { fillColor: colors[index % colors.length], textAlign: 'center', textAlignVertical: 'middle' },
    data: { content: `<p>${text}</p>`, shape: index % 4 === 0 ? 'round' : 'square' }
  }))

export function seedDemoBoard(existingId?: string): string {
  const items: unknown[] = [
    {
      id: 'demo_frame_1',
      type: 'frame',
      x: -1600,
      y: -900,
      width: 1200,
      height: 900,
      origin: 'center',
      relativeTo: 'canvas_center',
      style: { fillColor: '#fbfbfc' },
      data: { title: 'Бэклог спринта' }
    },
    {
      id: 'demo_frame_2',
      type: 'frame',
      x: 300,
      y: -700,
      width: 1200,
      height: 1100,
      origin: 'center',
      relativeTo: 'canvas_center',
      style: { fillColor: '#fbfbfc' },
      data: { title: 'Ключевые метрики' }
    },
    {
      id: 'demo_title',
      type: 'text',
      x: 300,
      y: -1500,
      width: 900,
      height: 80,
      origin: 'center',
      relativeTo: 'canvas_center',
      style: { color: '#18181b', fontSize: '54', textAlign: 'center', fontFamily: 'open_sans' },
      data: { content: '<p>Демонстрационная доска Liro</p>' }
    },
    {
      id: 'demo_subtitle',
      type: 'text',
      x: 300,
      y: -1410,
      width: 800,
      height: 40,
      origin: 'center',
      relativeTo: 'canvas_center',
      style: { color: '#71717a', fontSize: '22', textAlign: 'center', fontFamily: 'open_sans' },
      data: { content: '<p>Стикеры, фигуры, связи, рамки, картинки и таблицы</p>' }
    },
    {
      id: 'demo_shape_rect',
      type: 'shape',
      position: { x: 900, y: -500, origin: 'center', relativeTo: 'canvas_center' },
      geometry: { width: 360, height: 160, rotation: 0 },
      style: { fillColor: '#ffffff', borderColor: '#18181b', borderWidth: '2', color: '#18181b', fontSize: '20', textAlign: 'center', textAlignVertical: 'middle' },
      data: { content: '<p>Запуск</p>', shape: 'round_rectangle' }
    },
    {
      id: 'demo_shape_circle',
      type: 'shape',
      position: { x: 900, y: -200, origin: 'center', relativeTo: 'canvas_center' },
      geometry: { width: 200, height: 200, rotation: 0 },
      style: { fillColor: '#ffffff', borderColor: '#18181b', borderWidth: '2', color: '#18181b', fontSize: '18', textAlign: 'center', textAlignVertical: 'middle' },
      data: { content: '<p>Идея</p>', shape: 'circle' }
    },
    {
      id: 'demo_shape_diamond',
      type: 'shape',
      position: { x: 900, y: 180, origin: 'center', relativeTo: 'canvas_center' },
      geometry: { width: 220, height: 220, rotation: 0 },
      style: { fillColor: '#ffffff', borderColor: '#18181b', borderWidth: '2', color: '#18181b', fontSize: '18', textAlign: 'center', textAlignVertical: 'middle' },
      data: { content: '<p>Риск</p>', shape: 'rhombus' }
    },
    {
      id: 'demo_conn_1',
      type: 'connector',
      shape: 'curved',
      startItem: { id: 'demo_shape_rect', position: { x: '50%', y: '100%' } },
      endItem: { id: 'demo_shape_circle', position: { x: '50%', y: '0%' } },
      style: { strokeColor: '#18181b', strokeWidth: '2', strokeStyle: 'normal', startStrokeCap: 'none', endStrokeCap: 'stealth' }
    },
    {
      id: 'demo_conn_2',
      type: 'connector',
      shape: 'elbowed',
      startItem: { id: 'demo_shape_circle', position: { x: '50%', y: '100%' } },
      endItem: { id: 'demo_shape_diamond', position: { x: '50%', y: '0%' } },
      style: { strokeColor: '#71717a', strokeWidth: '2', strokeStyle: 'dashed', startStrokeCap: 'none', endStrokeCap: 'stealth' }
    },
    {
      id: 'demo_image',
      type: 'image',
      position: { x: -300, y: -300, origin: 'center', relativeTo: 'canvas_center' },
      geometry: { width: 560, height: 350, rotation: 0 },
      data: { imageUrl: sampleImage, title: 'Схема продукта' }
    },
    {
      id: 'demo_table',
      type: 'table',
      position: { x: -300, y: 250, origin: 'center', relativeTo: 'canvas_center' },
      geometry: { width: 620, height: 260, rotation: 0 },
      style: { fontSize: '16' },
      data: {
        columnWidths: [200, 200, 220],
        rowHeights: [50, 100, 110],
        cells: [
          ['Метрика', 'Значение', 'Динамика'],
          ['Активные пользователи', '12 480', '+18% за месяц'],
          ['Время на доске', '34 минуты', '+2 минуты']
        ]
      }
    },
    {
      id: 'demo_card',
      type: 'card',
      position: { x: 1100, y: -800, origin: 'center', relativeTo: 'canvas_center' },
      geometry: { width: 260, height: 180, rotation: 0 },
      style: { cardTheme: '#18181b' },
      data: { title: '<p>Релиз 2.0</p>', description: '<p>Собрать обратную связь и подготовить демо.</p>' }
    },
    ...cluster(
      -1450,
      -500,
      ['yellow', 'light_blue', 'light_green', 'light_pink', 'violet', 'orange'],
      [
        'Собрать все требования',
        'Проверить сроки',
        'Нарисовать прототип',
        'Согласовать API',
        'Подготовить тесты',
        'Обновить документацию',
        'Запланировать релиз',
        'Снять метрики',
        'Настроить мониторинг'
      ]
    ),
    ...cluster(
      420,
      520,
      ['cyan', 'light_yellow', 'pink'],
      ['Цель спринта', 'Риск', 'Идея']
    )
  ]

  const existing = existingId ? store.index.boards.find((board) => board.id === existingId) : undefined
  const result = buildDoc({
    docId: existingId,
    title: existing?.title ?? 'Демонстрационная доска',
    rawItems: items as never[],
    source: { kind: 'demo', name: 'Демонстрационная доска' },
    tags: ['демо']
  })
  const doc: BoardDoc = { ...result.doc, thumbnail: 'thumb.png' }
  commitDoc(doc)
  return doc.id
}

export function resetDemoBoard(): string | null {
  const existing = store.index.boards.find((board) => board.tags?.includes('демо'))
  if (!existing) return null
  seedDemoBoard(existing.id)
  return existing.id
}

export function ensureDemoBoard(): string {
  const existing = store.index.boards.find((board) => board.tags?.includes('демо'))
  if (existing) return existing.id
  return seedDemoBoard()
}