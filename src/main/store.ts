import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { uid } from '@shared/util'
import type { BoardDoc, BoardMeta, LibraryIndex, Project, Settings } from '@shared/types'
import { assetsDir, boardsDir, docDir, docFile, indexFile, readJson, settingsFile, thumbFile, writeAtomic } from './paths'

const SCHEMA = 1

const DEFAULT_SETTINGS: Settings = {
  gridSize: 40,
  gridMode: 'dots',
  snapGrid: false,
  alignSnap: true,
  userName: '',
  exportScale: 2,
  exportBackground: 'white',
  imageQuality: 'original',
  uiScale: 1,
  toolbarOrder: [],
  toolbarExtras: [],
  brushPresets: [
    { color: '#1f2023', width: 3 },
    { color: '#d6484a', width: 6 },
    { color: '#3f74cf', width: 12 }
  ],
  brushIndex: 0,
  markerPresets: [
    { color: '#fff9b1', width: 12 },
    { color: '#cfe8fb', width: 18 },
    { color: '#d9f2e3', width: 24 }
  ],
  markerIndex: 0,
  captureToken: ''
}

function emptyIndex(): LibraryIndex {
  return { schemaVersion: SCHEMA, boards: [], projects: [] }
}

export class Store {
  index: LibraryIndex = emptyIndex()
  settings: Settings = { ...DEFAULT_SETTINGS }

  load(): void {
    this.index = readJson<LibraryIndex>(indexFile(), emptyIndex())
    this.index.boards ??= []
    this.index.projects ??= []
    const settings = readJson<Partial<Settings>>(settingsFile(), {})
    this.settings = { ...DEFAULT_SETTINGS, ...settings }
    if (!this.settings.captureToken) {
      this.settings.captureToken = randomBytes(16).toString('hex')
      this.saveSettings()
    }
    this.repairIndex()
  }

  private repairIndex(): void {
    let changed = false
    if (!Array.isArray(this.index.boards)) {
      this.index.boards = []
      changed = true
    }
    if (!Array.isArray(this.index.projects)) {
      this.index.projects = []
      changed = true
    }
    if (this.index.schemaVersion !== SCHEMA) {
      this.index.schemaVersion = SCHEMA
      changed = true
    }
    const known = new Set(this.index.projects.map((p) => p.id))
    for (const board of this.index.boards) {
      if (board.projectId && !known.has(board.projectId)) {
        delete board.projectId
        changed = true
      }
      if (!existsSync(docFile(board.id))) {
        board.archived = true
        changed = true
      }
    }
    const sessions = this.index.boards.filter((board) => board.tags?.includes('сессия'))
    if (sessions.length) {
      for (const board of sessions) {
        rmSync(docDir(board.id), { recursive: true, force: true })
        this.index.boards = this.index.boards.filter((item) => item.id !== board.id)
        changed = true
      }
    }
    if (this.index.boards.some((board) => typeof board.order !== 'number')) {
      const legacy = [...this.index.boards].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
      legacy.forEach((board, i) => {
        board.order = i
      })
      changed = true
    }
    if (changed) this.saveIndex()
  }

  saveIndex(): void {
    this.index.boards.sort(compareBoards)
    writeAtomic(indexFile(), JSON.stringify(this.index, null, 2))
  }

  saveSettings(): void {
    writeAtomic(settingsFile(), JSON.stringify(this.settings, null, 2))
  }

  meta(docId: string): BoardMeta | undefined {
    return this.index.boards.find((b) => b.id === docId)
  }

  boards(options?: { archived?: boolean; projectId?: string }): BoardMeta[] {
    const archived = options?.archived ?? false
    return this.index.boards.filter((b) => (options?.projectId ? b.projectId === options.projectId : true) && b.archived === archived)
  }

  projects(): Project[] {
    return [...this.index.projects].sort((a, b) => a.order - b.order)
  }

  createProject(name: string, description?: string): Project {
    const now = new Date().toISOString()
    const project: Project = {
      id: uid('prj_'),
      name: name.trim() || 'Новый проект',
      description,
      createdAt: now,
      updatedAt: now,
      order: this.index.projects.length
    }
    this.index.projects.push(project)
    this.saveIndex()
    return project
  }

  updateProject(id: string, patch: Partial<Project>): Project {
    const project = this.index.projects.find((p) => p.id === id)
    if (!project) throw new Error('Проект не найден')
    Object.assign(project, patch, { updatedAt: new Date().toISOString() })
    this.saveIndex()
    return project
  }

  deleteProject(id: string): void {
    this.index.projects = this.index.projects.filter((p) => p.id !== id)
    for (const board of this.index.boards) {
      if (board.projectId === id) delete board.projectId
    }
    this.index.projects.forEach((p, i) => (p.order = i))
    this.saveIndex()
  }

  reorderProjects(ids: string[]): void {
    ids.forEach((id, i) => {
      const project = this.index.projects.find((p) => p.id === id)
      if (project) project.order = i
    })
    this.saveIndex()
  }

  reorderBoards(ids: string[]): void {
    const placed = new Set<string>()
    let at = 0
    for (const id of ids) {
      const board = this.meta(id)
      if (!board || placed.has(id)) continue
      placed.add(id)
      board.order = at++
    }
    for (const board of [...this.index.boards].sort(compareBoards)) {
      if (placed.has(board.id)) continue
      board.order = at++
    }
    this.saveIndex()
  }

  createDoc(docId: string, doc: BoardDoc): void {
    mkdirSync(assetsDir(docId), { recursive: true })
    this.writeDoc(doc)
  }

  writeDoc(doc: BoardDoc): void {
    doc.updatedAt = new Date().toISOString()
    writeAtomic(docFile(doc.id), JSON.stringify(doc))
    const existing = this.meta(doc.id)
    const meta: BoardMeta = {
      id: doc.id,
      title: doc.title,
      description: doc.description,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      bounds: doc.bounds,
      itemCount: doc.stats.items,
      thumbnail: existsSync(thumbFile(doc.id)) ? `thumb.png` : undefined,
      projectId: doc.projectId,
      tags: doc.tags,
      favorite: doc.favorite,
      archived: doc.archived,
      color: doc.color,
      sourceKind: doc.source.kind,
      sourceUrl: doc.source.url,
      sourceBoardId: doc.source.boardId,
      assetBytes: doc.stats.assetsBytes
    }
    if (existing) Object.assign(existing, meta)
    else this.index.boards.unshift({ ...meta, order: this.topOrder() - 1 })
    this.saveIndex()
  }

  private topOrder(): number {
    let top = 0
    for (const board of this.index.boards) top = Math.min(top, board.order ?? 0)
    return top
  }

  readDoc(docId: string): BoardDoc {
    const doc = readJson<BoardDoc | null>(docFile(docId), null)
    if (!doc) throw new Error('Доска не найдена или повреждена')
    return migrateDoc(doc)
  }

  patchMeta(docId: string, patch: Partial<BoardMeta>): BoardMeta {
    const meta = this.meta(docId)
    if (!meta) throw new Error('Доска не найдена')
    Object.assign(meta, patch)
    meta.updatedAt = new Date().toISOString()
    const doc = this.readDoc(docId)
    Object.assign(doc, {
      title: patch.title ?? doc.title,
      description: patch.description ?? doc.description,
      projectId: patch.projectId ?? doc.projectId,
      tags: patch.tags ?? doc.tags,
      favorite: patch.favorite ?? doc.favorite,
      archived: patch.archived ?? doc.archived,
      color: patch.color ?? doc.color
    })
    this.writeDoc(doc)
    return meta
  }

  setThumbnail(docId: string, file: string | undefined): void {
    const meta = this.meta(docId)
    if (!meta) return
    meta.thumbnail = file
    this.saveIndex()
  }

  saveViewport(docId: string, viewport: { x: number; y: number; zoom: number }): void {
    const file = docFile(docId)
    if (!existsSync(file)) return
    const doc = readJson<BoardDoc | null>(file, null)
    if (!doc) return
    doc.viewport = viewport
    writeAtomic(file, JSON.stringify(doc))
  }


  duplicateDoc(docId: string, newId: string): BoardMeta {
    const doc = this.readDoc(docId)
    doc.id = newId
    doc.title = `${doc.title} — копия`
    doc.createdAt = new Date().toISOString()
    doc.updatedAt = doc.createdAt
    doc.favorite = false
    for (const item of doc.items) item.id = `${newId}_${item.id}`
    mkdirSync(assetsDir(newId), { recursive: true })
    const sourceAssets = assetsDir(docId)
    if (existsSync(sourceAssets)) {
      for (const entry of readdirSync(sourceAssets)) {
        const from = join(sourceAssets, entry)
        const to = join(assetsDir(newId), entry)
        if (existsSync(to)) continue
        try {
          copyFileSync(from, to)
        } catch {
          continue
        }
      }
    }
    this.writeDoc(doc)
    return this.meta(newId)!
  }

  deleteDoc(docId: string): void {
    this.index.boards = this.index.boards.filter((b) => b.id !== docId)
    if (this.index.lastOpenedBoardId === docId) delete this.index.lastOpenedBoardId
    this.saveIndex()
    rmSync(docDir(docId), { recursive: true, force: true })
  }

  usage(): { boards: number; bytes: number } {
    let bytes = 0
    const dir = boardsDir()
    if (existsSync(dir)) {
      for (const entry of readdirSync(dir)) {
        const folder = join(dir, entry)
        try {
          if (statSync(folder).isDirectory()) bytes += folderSize(folder)
        } catch {
          continue
        }
      }
    }
    return { boards: this.index.boards.length, bytes }
  }
}

function compareBoards(a: BoardMeta, b: BoardMeta): number {
  if (a.order !== b.order) return (a.order ?? 0) - (b.order ?? 0)
  return a.updatedAt < b.updatedAt ? 1 : -1
}

function folderSize(dir: string): number {  let total = 0
  const walk = (current: string): void => {
    let entries: string[] = []
    try {
      entries = readdirSync(current)
    } catch {
      return
    }
    for (const entry of entries) {
      const full = join(current, entry)
      try {
        const st = statSync(full)
        if (st.isDirectory()) walk(full)
        else total += st.size
      } catch {
        continue
      }
    }
  }
  walk(dir)
  return total
}

const LEGACY_SOURCE_KINDS: Record<string, string> = {
  'miro-api': 'server-api',
  'miro-capture': 'page-capture'
}

function migrateDoc(doc: BoardDoc): BoardDoc {
  doc.schemaVersion ??= SCHEMA
  doc.items ??= []
  doc.assets ??= {}
  doc.tags ??= []
  doc.favorite ??= false
  doc.archived ??= false
  doc.stats ??= { items: doc.items.length, byKind: {}, frames: 0, images: 0, connectors: 0, texts: 0, sticky: 0, plainChars: 0, assetsBytes: 0 }
  doc.bounds ??= { x: 0, y: 0, width: 2400, height: 1600 }
  for (const item of doc.items as unknown as Array<Record<string, unknown>>) {
    if (item.miroType !== undefined && item.sourceType === undefined) item.sourceType = item.miroType
    delete item.miroType
  }
  for (const asset of Object.values(doc.assets) as unknown as Array<Record<string, unknown>>) {
    if (asset.miroId !== undefined && asset.sourceId === undefined) asset.sourceId = asset.miroId
    delete asset.miroId
  }
  const legacyKind = LEGACY_SOURCE_KINDS[doc.source?.kind ?? '']
  if (legacyKind) doc.source.kind = legacyKind as BoardDoc['source']['kind']
  return doc
}

export const store = new Store()
export { DEFAULT_SETTINGS }