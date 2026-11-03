import type { BoardItem, ItemKind } from '@shared/types'

const KIND_LABELS: Partial<Record<ItemKind, string>> = {
  sticky: 'Стикер',
  text: 'Текст',
  shape: 'Фигура',
  image: 'Картинка',
  frame: 'Рамка',
  connector: 'Связь',
  card: 'Карточка',
  embed: 'Вставка',
  video: 'Видео',
  table: 'Таблица',
  vote: 'Голосование',
  group: 'Группа',
  tag: 'Метка',
  document: 'Файл',
  app_card: 'Приложение',
  code: 'Код',
  path: 'Рисунок',
  comment: 'Комментарий',
  solid: '3D-фигура',
  graph: 'Координатная плоскость',
  unknown: 'Не распознано'
}

const UNSUPPORTED_KINDS: ItemKind[] = [
  'unknown',
  'embed',
  'video',
  'table',
  'vote',
  'app_card',
  'code',
  'document',
  'comment',
  'tag',
  'group',
  'card'
]

export function isUnsupported(item: BoardItem): boolean {
  return UNSUPPORTED_KINDS.includes(item.kind)
}

export function kindLabel(kind: ItemKind): string {
  return KIND_LABELS[kind] ?? 'Объект'
}