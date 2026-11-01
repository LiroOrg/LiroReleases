import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { linkHtml, parseRichText, toPlainText } from '@shared/richtext'
import { normalizeItems } from './import/normalize'
import { guessKind, previewSrc } from './preview'
import { csvToHtml, documentFromZip, markdownToHtml, readDocumentHtml, wordDocumentToHtml } from './documentText'
import { createZip, readZip } from './util/zip'
import { buildStats } from './import/commit'
import { normalizeColor, luminance } from '@shared/color'
import type { BoardDoc, BoardItem, ConnectorItem, ImageItem, ShapeItem, SolidItem, StickyItem } from '@shared/types'
import { boundsOfItems, parseBoardRef, sanitizeFileName, withoutDanglingConnectors } from '@shared/util'
import { deriveConnectorPoints } from '@shared/geometry'
import { buildSvg } from './export/svg'
import { fitScale } from './export/render'
import { parseRoute } from '@shared/route'
import { parseChanges } from '@shared/changes'
import { readBundledChanges } from './changes'
import { decryptRoom, encryptRoom, newCode, normalizeCode, roomId } from './live/crypto'
import { codeFromLink, linkFromArgv } from './live/protocol'
import {
  faceFrame,
  faceLocalToWorld,
  faceWorldToLocal,
  hitTestFace,
  projectPoint,
  solidBounds,
  solidFaceAt,
  solidPolygons,
  solidProjection,
  solidVertices,
  polygonOverlapArea,
  strokeIntersections,
  type Vec2
} from '@shared/three'
import collectorSource from '@shared/page-collector.js?raw'

export interface SelfTestResult {
  passed: number
  failed: number
  failures: string[]
}

const check = (results: SelfTestResult, name: string, condition: boolean, detail = ''): void => {
  if (condition) {
    results.passed += 1
    return
  }
  results.failed += 1
  results.failures.push(`${name}${detail ? `: ${detail}` : ''}`)
}

const makeSolid = (overrides: Partial<SolidItem>): SolidItem => ({
  id: 'solid-1',
  kind: 'solid',
  x: 0,
  y: 0,
  w: 220,
  h: 220,
  rotation: 0,
  z: 0,
  solid: 'cube',
  edge: 120,
  pitch: 25,
  yaw: 35,
  faces: [
    { id: 'front', color: '#cfe8fb' },
    { id: 'top', color: '#e3e8f1' }
  ],
  sketch: [],
  lineWidth: 1.5,
  color: '#1a1a1a',
  showEdges: true,
  ...overrides
})

const polygonCenter = (points: Vec2[]): Vec2 => {
  const count = Math.max(1, points.length)
  const sum = points.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), { x: 0, y: 0 })
  return { x: sum.x / count, y: sum.y / count }
}

const spread = (points: Vec2[], axis: 'x' | 'y'): number => {
  const values = points.map((point) => point[axis])
  return Math.max(...values) - Math.min(...values)
}

export function runSelfTest(): SelfTestResult {
  const results: SelfTestResult = { passed: 0, failed: 0, failures: [] }

  check(results, 'коллектор не пуст', collectorSource.length > 4000, `${collectorSource.length} символов`)

  check(results, 'ссылка: текст с адресом становится ссылкой', linkHtml('https://liro.app/docs') === '<p><a href="https://liro.app/docs">https://liro.app/docs</a></p>', linkHtml('https://liro.app/docs'))
  check(results, 'ссылка: обычный текст остаётся текстом', linkHtml('просто слова') === '')
  check(results, 'ссылка: адрес с пробелом не считается ссылкой', linkHtml('https://liro.app/ два слова') === '')

  check(results, 'предпросмотр: ссылка остаётся ссылкой', previewSrc('https://site.ru/page') === 'https://site.ru/page')
  check(results, 'предпросмотр: локальный путь становится адресом файла', previewSrc('C:\\docs\\file.pdf').startsWith('file:///C:/docs/file.pdf'), previewSrc('C:\\docs\\file.pdf'))
  check(results, 'предпросмотр: чужой адрес не трогаем', previewSrc('lirofile://doc/img.png') === 'lirofile://doc/img.png')
  check(results, 'предпросмотр: страница', guessKind('https://site.ru/page', 'file') === 'web')
  check(results, 'предпросмотр: картинка по ссылке', guessKind('https://site.ru/photo.png', 'file') === 'image')
  check(results, 'предпросмотр: pdf по файлу', guessKind('file:///C:/docs/file.pdf', 'file') === 'pdf')
  check(results, 'предпросмотр: текст по файлу', guessKind('file:///C:/docs/notes.md', 'file') === 'text')
  check(results, 'предпросмотр: видео по файлу', guessKind('file:///C:/docs/clip.mp4', 'file') === 'media')

  const wordXml =
    '<w:document><w:body>' +
    '<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>Заголовок &amp; точка</w:t></w:r></w:p>' +
    '<w:p><w:r><w:t>Строка один</w:t></w:r><w:r><w:tab/><w:rPr><w:i/></w:rPr><w:t xml:space="preserve">&lt;таб&gt;</w:t></w:r></w:p>' +
    '<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/></w:numPr></w:pPr><w:r><w:t>Пункт</w:t></w:r></w:p>' +
    '<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/></w:numPr></w:pPr><w:r><w:t>Ещё пункт</w:t></w:r></w:p>' +
    '<w:p><w:r><w:t><script>alert(1)</script></w:t></w:r></w:p>' +
    '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Ячейка</w:t></w:r></w:p></w:tc></w:tr></w:tbl>' +
    '</w:body></w:document>'
  const wordHtml = wordDocumentToHtml(wordXml)
  check(results, 'документ: стиль заголовка и жирный', wordHtml.includes('<h3><strong>Заголовок &amp; точка</strong></h3>'), wordHtml)
  check(results, 'документ: табуляция и курсив', wordHtml.includes('<em>\t&lt;таб&gt;</em>'))
  check(results, 'документ: список соседних пунктов', wordHtml.includes('<ul class="doc-ul"><li>Пункт</li><li>Ещё пункт</li></ul>'))
  check(results, 'документ: таблица', wordHtml.includes('<td>Ячейка</td>'))
  check(results, 'документ: разметка из файла не исполняется', !wordHtml.includes('<script'))

  const docxDir = mkdtempSync(join(tmpdir(), 'liro-doc-'))
  try {
    const docxFile = join(docxDir, 'документ.docx')
    writeFileSync(docxFile, createZip([{ name: 'word/document.xml', data: Buffer.from(wordXml, 'utf8') }]))
    check(results, 'документ: чтение docx целиком', (readDocumentHtml(docxFile) ?? '').includes('<td>Ячейка</td>'))
    check(results, 'документ: определение типа', guessKind(`file:///${docxFile.replace(/\\/g, '/')}`, 'file') === 'text')
  } finally {
    rmSync(docxDir, { recursive: true, force: true })
  }

  const mdHtml = markdownToHtml(
    '# Заголовок\n\nОбычный **жирный** и *курсив*, `код`.\n\n- первый\n- второй\n\n1. раз\n2. два\n\n> цитата\n\n```js\nconst a = 1 < 2\n```\n\n| Имя | Роль |\n| --- | --- |\n| Аня | админ |\n\n[ссылка](https://liro.app) и <script>плохо</script>\n'
  )
  check(results, 'markdown: заголовок', mdHtml.includes('<h1>Заголовок</h1>'), mdHtml)
  check(results, 'markdown: выделение', mdHtml.includes('<strong>жирный</strong>') && mdHtml.includes('<em>курсив</em>') && mdHtml.includes('<code>код</code>'))
  check(results, 'markdown: списки', mdHtml.includes('<ul class="doc-ul"><li>первый</li><li>второй</li></ul>') && mdHtml.includes('<li>раз</li>'))
  check(results, 'markdown: цитата и код блока', mdHtml.includes('<blockquote>цитата</blockquote>') && mdHtml.includes('const a = 1 &lt; 2'))
  check(results, 'markdown: таблица', mdHtml.includes('<th>Имя</th>') && mdHtml.includes('<td>админ</td>'))
  check(results, 'markdown: ссылка', mdHtml.includes('<a href="https://liro.app">ссылка</a>'))
  check(results, 'markdown: чужая разметка не исполняется', !mdHtml.includes('<script'))

  const csvHtml = csvToHtml('имя;сумма\n"петя, вася";12\n"котя""";13\n', ',')
  check(results, 'csv: разделитель по точке с запятой', csvHtml.html.includes('<th>сумма</th>'), csvHtml.html)
  check(results, 'csv: кавычки и запятая внутри', csvHtml.html.includes('<td>петя, вася</td>') && csvHtml.html.includes('<td>котя"</td>'), csvHtml.html)
  check(results, 'csv: без обрезки', !csvHtml.truncated)

  const sheetZip = new Map<string, Buffer>([
    ['xl/workbook.xml', Buffer.from('<workbook><sheets><sheet name="Лист1" sheetId="1" r:id="rId1"/></sheets></workbook>', 'utf8')],
    ['xl/_rels/workbook.xml.rels', Buffer.from('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>', 'utf8')],
    ['xl/sharedStrings.xml', Buffer.from('<sst><si><t>Товар</t></si><si><t>Хлеб</t></si></sst>', 'utf8')],
    ['xl/worksheets/sheet1.xml', Buffer.from('<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row><row r="2"><c r="A2"><v>12.5</v></c></row></sheetData></worksheet>', 'utf8')]
  ])
  const sheetHtml = documentFromZip('sheet', sheetZip)
  check(results, 'таблица xlsx: имя листа и строки', sheetHtml.includes('<h2>Лист1</h2>') && sheetHtml.includes('<td>Хлеб</td>'), sheetHtml)
  check(results, 'таблица xlsx: пустые ячейки на месте', sheetHtml.includes('<td></td><td>Хлеб</td>'), sheetHtml)

  const slidesHtml = documentFromZip(
    'slides',
    new Map([
      ['ppt/slides/slide1.xml', Buffer.from('<p:sld><a:p><a:r><a:t>Привет</a:t></a:r></a:p><a:p><a:r><a:t>Мир</a:t></a:r></a:p></p:sld>', 'utf8')],
      ['ppt/slides/slide2.xml', Buffer.from('<p:sld><a:p><a:r><a:t>Вторая</a:t></a:r></a:p></p:sld>', 'utf8')]
    ])
  )
  check(results, 'слайды pptx: текст по слайдам', slidesHtml.includes('<h2>Слайд 1</h2><p>Привет</p><p>Мир</p>') && slidesHtml.includes('Вторая'), slidesHtml)

  const zip = createZip([
    { name: 'a/текст.txt', data: Buffer.from('Привет, мир ✓', 'utf8') },
    { name: 'a/байты.bin', data: Buffer.from([0, 1, 2, 250, 251, 252, 253]) }
  ])
  const unpacked = readZip(zip)
  check(results, 'zip: список записей', unpacked.size === 2, `${unpacked.size}`)
  check(
    results,
    'zip: UTF-8 содержимое',
    unpacked.get('a/текст.txt')?.toString('utf8') === 'Привет, мир ✓',
    unpacked.get('a/текст.txt')?.toString('utf8')
  )
  check(
    results,
    'zip: бинарные данные',
    Buffer.from(unpacked.get('a/байты.bin') ?? []).equals(Buffer.from([0, 1, 2, 250, 251, 252, 253]))
  )

  const blocks = parseRichText('<p>Привет <b>мир</b> и <a href="https://miro.com">ссылка</a></p><ul><li>раз</li><li>два</li></ul>')
  check(results, 'richtext: три блока', blocks.length === 3, `${blocks.length}`)
  check(results, 'richtext: жирный фрагмент', blocks[0]?.runs.some((run) => run.b && run.text.includes('мир')) === true)
  check(results, 'richtext: ссылка', blocks[0]?.runs.some((run) => run.href === 'https://miro.com') === true)
  check(results, 'richtext: список', blocks[1]?.type === 'li' && blocks[2]?.type === 'li')
  check(
    results,
    'richtext: простой текст',
    toPlainText('<p>Строка 1</p><p>Строка 2</p>').replace(/\s+/g, ' ').trim() === 'Строка 1 Строка 2'
  )
  const plainBlocks = parseRichText('Просто текст без тегов')
  check(
    results,
    'richtext: текст без тегов виден',
    plainBlocks.length === 1 && plainBlocks[0]?.runs[0]?.text === 'Просто текст без тегов',
    JSON.stringify(plainBlocks)
  )
  const mixedBlocks = parseRichText('Строка<p>Вторая</p>')
  check(results, 'richtext: смешанный текст виден', mixedBlocks.length >= 1, `${mixedBlocks.length}`)

  check(results, 'цвет: имя палитры', normalizeColor('light_yellow') === '#fff9b1', normalizeColor('light_yellow'))
  check(results, 'цвет: hex с альфой', normalizeColor('#ffffff00') === '#ffffff')
  check(results, 'цвет: luminance', Math.abs(luminance('#ffffff') - 1) < 0.001)

  const sdkItems = normalizeItems([
    {
      id: 'frame1',
      type: 'frame',
      x: 1000,
      y: 800,
      width: 1000,
      height: 800,
      origin: 'center',
      relativeTo: 'canvas_center',
      style: { fillColor: '#ffffffff' },
      data: { title: 'Рамка' }
    },
    {
      id: 'sticky1',
      type: 'sticky_note',
      x: 1100,
      y: 900,
      width: 200,
      height: 200,
      origin: 'center',
      relativeTo: 'parent_top_left',
      parentId: 'frame1',
      style: { fillColor: 'cyan', textAlign: 'center', textAlignVertical: 'middle' },
      data: { content: '<p>Идея</p>', shape: 'square' }
    },
    {
      id: 'text1',
      type: 'text',
      x: 0,
      y: 0,
      width: 300,
      height: 40,
      origin: 'center',
      relativeTo: 'canvas_center',
      style: { color: '#1a1a1a', fontSize: '18' },
      data: { content: '<p>Заголовок</p>' }
    },
    {
      id: 'shape1',
      type: 'shape',
      position: { x: 500, y: 500, origin: 'center', relativeTo: 'canvas_center' },
      geometry: { width: 320, height: 120, rotation: 15 },
      style: { fillColor: '#8fd14f', borderWidth: '3', borderStyle: 'dashed', color: '#000000' },
      data: { content: 'Блок', shape: 'rhombus' }
    },
    {
      id: 'conn1',
      type: 'connector',
      shape: 'curved',
      startItem: { id: 'sticky1', position: { x: '50%', y: '0%' } },
      endItem: { id: 'text1', position: { x: '0%', y: '50%' } },
      style: { strokeColor: '#2d9bf0', strokeWidth: '2', endStrokeCap: 'stealth' }
    },
    {
      id: 'img1',
      type: 'image',
      position: { x: 0, y: 0, origin: 'center', relativeTo: 'canvas_center' },
      geometry: { width: 512, height: 512 },
      data: { imageUrl: 'https://api.miro.com/v2/boards/abc=/resources/images/12345?format=preview&redirect=false', title: 'Фото' }
    }
  ])

  const items = sdkItems.items
  const kinds = items.map((item) => `${item.id}:${item.kind}:${item.sourceType}`).join(', ')
  const frame = items.find((item) => item.id === 'frame1')
  const sticky = items.find((item) => item.id === 'sticky1') as StickyItem | undefined
  const shape = items.find((item) => item.id === 'shape1') as ShapeItem | undefined
  const connector = items.find((item) => item.id === 'conn1') as ConnectorItem | undefined
  const image = items.find((item) => item.id === 'img1') as ImageItem | undefined
  const heading = items.find((item) => item.id === 'text1') as
    | { fontSize?: number; h?: number; w?: number; plain?: string }
    | undefined

  check(results, 'нормализация: количество', items.length === 6, `${items.length} [${kinds}]`)
  check(results, 'рамка: позиция', frame?.x === 500 && frame?.y === 400, `${frame?.x},${frame?.y}`)
  check(
    results,
    'стикер: координаты относительно рамки',
    sticky?.x === 1100 + 500 && sticky?.y === 900 + 400,
    `${sticky?.x},${sticky?.y}`
  )
  check(results, 'стикер: цвет из палитры', sticky?.kind === 'sticky' && sticky.color === '#23bfe7', sticky?.color)
  check(results, 'фигура: diamond', shape?.kind === 'shape' && shape.shape === 'diamond', `${shape?.kind}`)
  check(results, 'фигура: размеры', shape?.w === 320 && shape?.h === 120, `${shape?.w}x${shape?.h}`)
  check(results, 'фигура: поворот', shape?.rotation === 15, `${shape?.rotation}`)
  check(
    results,
    'картинка: URL сохранён',
    image?.kind === 'image' && !!image.asset?.sourceUrl,
    `${image?.kind} ${JSON.stringify(image?.asset ?? null)}`
  )
  check(
    results,
    'связь: тип',
    connector?.kind === 'connector' && connector.shape === 'curved',
    `${connector?.kind}/${(connector as { shape?: string } | undefined)?.shape}`
  )
  const points = connector ? deriveConnectorPoints(connector, new Map(items.map((item) => [item.id, item]))) : []
  check(results, 'связь: построена по элементам', points.length === 2, JSON.stringify(points))
  check(
    results,
    'связь: концы на границах элементов',
    points.length === 2 && Math.abs(points[0].x - 1700) < 0.01 && Math.abs(points[0].y - 1300) < 0.01,
    JSON.stringify(points)
  )
  const fitted = fitScale(9200, 7000, 2)
  check(
    results,
    'png: кадр не больше окна рендера',
    fitted * 9200 <= 8600 && fitted * 7000 <= 8600,
    `масштаб ${fitted}`
  )
  check(results, 'статистика: стили', buildStats(items, 0).items === 6)
  const rotated = boundsOfItems([
    { id: 'r1', kind: 'shape', x: 0, y: 0, w: 800, h: 100, rotation: 45, z: 0 },
    { id: 'r2', kind: 'shape', x: 1000, y: 0, w: 100, h: 100, rotation: 0, z: 0 }
  ] as unknown as BoardItem[], 0)
  const flat = boundsOfItems([
    { id: 'r3', kind: 'shape', x: 0, y: 0, w: 800, h: 100, rotation: 0, z: 0 }
  ] as unknown as BoardItem[], 0)
  check(
    results,
    'рамка доски учитывает поворот',
    rotated.height > flat.height * 4 && rotated.y < 0 && flat.y === 0,
    `повёрнутая ${Math.round(rotated.height)}px против ${Math.round(flat.height)}px`
  )
  const withoutSticky = withoutDanglingConnectors(items, new Set(['sticky1']))
  const withoutFrame = withoutDanglingConnectors(items, new Set(['frame1']))
  check(
    results,
    'связи удаляются вместе с концами',
    withoutSticky.length === items.length - 1 &&
      !withoutSticky.some((item) => item.id === 'conn1') &&
      withoutFrame.length === items.length,
    `${items.length} объектов → ${withoutSticky.length}, связь ${connector?.startItemId}→${connector?.endItemId}`
  )
  const svgOut = buildSvg(
    { id: 'doc1', title: 'doc1', items, bounds: { x: 0, y: 0, width: 2400, height: 1800 } } as unknown as BoardDoc,
    'doc1',
    'white'
  )
  check(
    results,
    'svg: связь выходит по концам элементов',
    points.length === 2 && svgOut.includes(`M ${points[0].x} ${points[0].y}`) && / Q /.test(svgOut),
    `${points.length} точек, ${svgOut.match(/<path/g)?.length ?? 0} путей`
  )
  const rich = buildSvg(
    {
      id: 'doc2',
      title: 'doc2',
      bounds: { x: 0, y: 0, width: 900, height: 400 },
      items: [
        {
          id: 'table:1',
          kind: 'table',
          x: 0,
          y: 0,
          w: 360,
          h: 72,
          rotation: 0,
          z: 0,
          columns: 2,
          rows: 2,
          columnWidths: [180, 180],
          rowHeights: [36, 36],
          cells: ['Заголовок', '1', 'очень длинное значение ячейки которое должно перенестись на вторую строку', '2'],
          fontSize: 14
        },
        {
          id: 'graph1',
          kind: 'graph',
          x: 400,
          y: 0,
          w: 400,
          h: 300,
          rotation: 0,
          z: 1,
          scale: 40,
          originX: 0.5,
          originY: 0.5,
          gridStep: 1,
          showGrid: true,
          showLabels: true,
          axisColor: '#1a1a1a',
          lineWidth: 1.5,
          expressions: [{ id: 'e1', formula: 'x*2', color: '#1a1a1a', lineWidth: 2, visible: true }]
        }
      ]
    } as unknown as BoardDoc,
    'doc2',
    'white'
  )
  check(
    results,
    'svg: таблица с линиями и текстом',
    rich.includes('Заголовок') && rich.includes('stroke="#e4e4e7"') && rich.includes('…'),
    `${rich.match(/<text/g)?.length ?? 0} надписей`
  )
  check(
    results,
    'svg: график с осями и кривой',
    rich.includes('<polyline') && rich.includes('clip-path="url(#graph-graph1)"'),
    `${rich.match(/<polyline/g)?.length ?? 0} ломаных`
  )
  check(
    results,
    'текст: размер шрифта из источника сохранён',
    heading?.fontSize === 18,
    `${heading?.fontSize}`
  )
  check(
    results,
    'текст: рамка вмещает строку',
    (heading?.h ?? 0) >= Math.round((heading?.fontSize ?? 0) * 1.25) + 4,
    `h=${heading?.h}, шрифт=${heading?.fontSize}`
  )

  const unknown = normalizeItems([{ id: 'x1', type: 'kanban', x: 0, y: 0, width: 10, height: 10 }])
  check(results, 'неизвестный тип сохранён', unknown.items[0]?.kind === 'unknown')
  check(results, 'предупреждение о типе', unknown.warnings.some((text) => text.includes('kanban')))

  const routeSearch = parseRoute('#/search/%D0%A5%D0%B8%D0%BC%D0%B8%D1%8F')
  check(
    results,
    'маршрут поиска: слово в адресе',
    routeSearch.name === 'search' && routeSearch.query === 'Химия',
    JSON.stringify(routeSearch)
  )
  const routeQuery = parseRoute('#/search?%D0%A5%D0%B8%D0%BC%D0%B8%D1%8F')
  check(results, 'маршрут поиска: старый вид', routeQuery.name === 'search' && routeQuery.query === 'Химия', JSON.stringify(routeQuery))
  const routeBoard = parseRoute('#/board/bd_123')
  check(results, 'маршрут доски', routeBoard.name === 'board' && routeBoard.docId === 'bd_123', JSON.stringify(routeBoard))

  const flatCube = makeSolid({ yaw: 0, pitch: 0 })
  const cubePolygons = solidPolygons(flatCube)
  const flatFront = cubePolygons.find((polygon) => polygon.id === 'front')
  const frontPoints = flatFront?.points ?? []
  const frontWidth = spread(frontPoints, 'x')
  const frontHeight = spread(frontPoints, 'y')
  const cubeVertices = solidVertices('cube', flatCube.edge).length
  check(
    results,
    'объём: у куба шесть граней и восемь вершин',
    cubePolygons.length === 6 && cubeVertices === 8,
    `${cubePolygons.length} граней, ${cubeVertices} вершин`
  )
  check(
    results,
    'объём: куб без наклона виден квадратной гранью',
    !!flatFront &&
      frontPoints.length === 4 &&
      Math.abs(frontWidth - frontHeight) < 0.01 &&
      Math.abs(frontWidth - flatCube.w) < 0.5,
    `${frontWidth.toFixed(2)}x${frontHeight.toFixed(2)} при рамке ${flatCube.w}`
  )

  const frontCenter = flatFront ? polygonCenter(flatFront.points) : { x: 0, y: 0 }
  const hit = hitTestFace(cubePolygons, frontCenter)
  const miss = hitTestFace(cubePolygons, { x: frontCenter.x - 5000, y: frontCenter.y })
  check(
    results,
    'объём: попадание в грань и промах рядом',
    hit?.id === 'front' && miss === null && solidFaceAt(flatCube, frontCenter)?.id === hit?.id,
    `${hit?.id ?? 'нет'}, промах ${miss === null ? 'пусто' : 'есть'}`
  )

  const spherePolygons = solidPolygons(makeSolid({ solid: 'sphere', yaw: 12 }))
  const sphereSize = solidBounds('sphere', 120, 25, 12)
  check(
    results,
    'объём: сфера собрана из множества граней',
    spherePolygons.length > 20 && sphereSize.width > 0 && sphereSize.height > 0,
    `${spherePolygons.length} полигонов, ${sphereSize.width}x${sphereSize.height}`
  )

  const cubeSize = solidBounds('cube', flatCube.edge, flatCube.pitch, flatCube.yaw)
  check(
    results,
    'объём: габариты куба в плоскости доски',
    cubeSize.width > 0 && cubeSize.height > 0 && cubeSize.width <= flatCube.edge * 2,
    `${cubeSize.width}x${cubeSize.height}`
  )

  const frontFrame = flatFront ? faceFrame(flatFront) : null
  const localPoint = frontFrame ? { x: frontFrame.width * 0.35, y: frontFrame.height * 0.6 } : { x: 0, y: 0 }
  const sketchSolid = makeSolid({
    yaw: 0,
    pitch: 0,
    sketch: [
      {
        face: 'front',
        points: [localPoint, { x: localPoint.x + 24, y: localPoint.y - 18 }],
        color: '#e8386d',
        lineWidth: 2
      }
    ]
  })
  const sketchPolygons = solidPolygons(sketchSolid)
  const sketchFace = sketchPolygons.find((polygon) => polygon.id === 'front')
  const sketchPoint = sketchFace
    ? projectPoint(faceLocalToWorld(sketchFace, localPoint), solidProjection(sketchSolid).camera)
    : { x: 0, y: 0 }
  const sketchHit = hitTestFace(sketchPolygons, sketchPoint)
  check(
    results,
    'объём: рисунок на грани попадает в ту же грань',
    !!sketchFace && sketchHit?.id === 'front',
    `${sketchHit?.id ?? 'нет'}`
  )
  const roundTrip = sketchFace ? faceWorldToLocal(sketchFace, faceLocalToWorld(sketchFace, localPoint)) : null
  check(
    results,
    'объём: координаты грани обратимы',
    !!roundTrip && Math.abs(roundTrip.x - localPoint.x) < 1e-6 && Math.abs(roundTrip.y - localPoint.y) < 1e-6,
    JSON.stringify(roundTrip)
  )

  const labelSolid = makeSolid({ yaw: 0, pitch: 0, labels: [{ face: 'front', point: localPoint, text: 'Молекула', size: 18 }] })
  const labelFace = solidPolygons(labelSolid).find((polygon) => polygon.id === 'front')
  const labelSpot = labelFace ? projectPoint(faceLocalToWorld(labelFace, localPoint), solidProjection(labelSolid).camera) : null
  const labelHit = labelFace ? hitTestFace(solidPolygons(labelSolid), labelSpot ?? { x: -1, y: -1 }) : null
  check(
    results,
    'объём: надпись на грани попадает в ту же грань',
    labelHit?.id === 'front',
    `${labelHit?.id ?? 'нет'}`
  )
  const labelSvg = buildSvg(
    { id: 'doc-label', title: 'doc-label', bounds: { x: 0, y: 0, width: 400, height: 400 }, items: [labelSolid] } as unknown as BoardDoc,
    'doc-label',
    'white'
  )
  check(
    results,
    'svg: текст на грани сохраняется',
    labelSvg.includes('Молекула') && /<text[^>]*transform="translate\([^"]*\) rotate\([^"]*\) scale\([^"]*\)"/.test(labelSvg),
    `${labelSvg.match(/<text/g)?.length ?? 0} надписей`
  )

  const crossing = strokeIntersections([
    [
      { x: 0, y: 0 },
      { x: 10, y: 10 }
    ],
    [
      { x: 0, y: 10 },
      { x: 10, y: 0 }
    ]
  ])
  check(
    results,
    'объём: пересечение штрихов найдено в точке скрещивания',
    crossing.length === 1 && Math.abs(crossing[0].x - 5) < 1e-6 && Math.abs(crossing[0].y - 5) < 1e-6,
    JSON.stringify(crossing)
  )
  const parallel = strokeIntersections([
    [
      { x: 0, y: 0 },
      { x: 10, y: 0 }
    ],
    [
      { x: 0, y: 4 },
      { x: 10, y: 4 }
    ]
  ])
  check(results, 'объём: параллельные штрихи не пересекаются', parallel.length === 0, `${parallel.length}`)
  const sameSelf = strokeIntersections([
    [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 10, y: 0 },
      { x: 0, y: 10 }
    ]
  ])
  const dedupe = strokeIntersections([
    [
      { x: 0, y: 0 },
      { x: 10, y: 10 }
    ],
    [
      { x: 10, y: 0 },
      { x: 0, y: 10 }
    ],
    [
      { x: 2, y: 8 },
      { x: 8, y: 2 }
    ]
  ])
  check(
    results,
    'объём: самопересечение найдено, кратные точки сведены',
    sameSelf.length === 1 && dedupe.length === 1,
    `само ${sameSelf.length}, сводно ${dedupe.length}`
  )

  const squareSilhouette = [
    { x: -50, y: -50 },
    { x: 50, y: -50 },
    { x: 50, y: 50 },
    { x: -50, y: 50 }
  ]
  const squareOver = squareSilhouette.map((point) => ({ x: point.x + 50, y: point.y }))
  const squareTouch = squareSilhouette.map((point) => ({ x: point.x + 100, y: point.y }))
  check(
    results,
    'фигуры: наложение силуэтов даёт площадь',
    polygonOverlapArea(squareSilhouette, squareOver) > 2 && polygonOverlapArea(squareSilhouette, squareOver) < 5001,
    `${polygonOverlapArea(squareSilhouette, squareOver).toFixed(1)}`
  )
  check(
    results,
    'фигуры: касание силуэтов не считается наложением',
    polygonOverlapArea(squareSilhouette, squareTouch) < 0.01,
    `${polygonOverlapArea(squareSilhouette, squareTouch).toFixed(3)}`
  )

  const ink = normalizeItems([
    {
      id: 'p1',
      type: 'paint',
      x: -5709,
      y: -7207,
      width: 140.2,
      height: 127.75,
      position: { x: -5638.9, y: -7143.1 },
      geometry: { width: 140.2, height: 127.75 },
      style: { strokeColor: '#1a1a1a', strokeWidth: 2 },
      data: {
        points: [
          { x: 0, y: 16 },
          { x: 40, y: 4 },
          { x: 90, y: 60 }
        ]
      }
    },
    {
      id: 'p2',
      type: 'paint',
      x: 0,
      y: 0,
      data: { points: [{ x: 1, y: 1 }] }
    }
  ])
  const stroke = ink.items.find((item) => item.id === 'p1')
  const line = stroke?.kind === 'path' ? stroke : undefined
  check(results, 'рисунок: создан штрих', !!line && line.points.length === 3, `${stroke?.kind}`)
  check(
    results,
    'рисунок: позиция и толщина',
    !!line && Math.round(line.x) === -5709 && line.lineWidth === 2 && line.color === '#1a1a1a',
    line ? `${Math.round(line.x)},${line.lineWidth},${line.color}` : 'нет штриха'
  )
  check(results, 'рисунок: вырожденный штрих отброшен', ink.items.length === 1, `${ink.items.length}`)

  const media = normalizeItems([
    {
      id: 'i1',
      type: 'image',
      x: 100,
      y: -3491,
      width: 1737,
      height: 2560,
      geometry: { width: 1737, height: 2560 },
      position: { x: 985.45, y: -2211.6 },
      data: {
        resourceId: '3458764518276001096',
        naturalWidth: 1737,
        naturalHeight: 2560,
        crop: { x: 0, y: 0, width: 1737, height: 2560 }
      }
    }
  ])
  const picture = media.items[0] as ImageItem
  check(results, 'картинка: сохранён id ресурса', picture?.asset?.sourceId === '3458764518276001096', picture?.asset?.sourceId)
  check(
    results,
    'картинка: размер и позиция',
    picture?.w === 1737 && picture?.h === 2560 && Math.round(picture?.x ?? 0) === 117,
    `${picture?.w}x${picture?.h} @${Math.round(picture?.x ?? 0)}`
  )
  check(results, 'картинка: файл ещё не скачан', picture?.asset?.file === '', picture?.asset?.file)

  check(
    results,
    'коллектор: канал через расширение',
    collectorSource.includes('liro-collector-request') && collectorSource.includes('liro-collector-response')
  )

  check(
    results,
    'ссылка на доску',
    parseBoardRef('https://miro.com/app/board/uXjVOD6LSME=/?team_id=123').boardId === 'uXjVOD6LSME=',
    parseBoardRef('https://miro.com/app/board/uXjVOD6LSME=/').boardId
  )
  check(results, 'имя файла', sanitizeFileName('Доска / отчёт: 2026?') === 'Доска отчёт 2026', sanitizeFileName('Доска / отчёт: 2026?'))

  const dir = mkdtempSync(join(tmpdir(), 'liro-test-'))
  check(results, 'временная папка', !!dir)
  rmSync(dir, { recursive: true, force: true })

  const code = newCode()
  check(results, 'код комнаты: формат', /^[a-z0-9]{3}-[a-z0-9]{3}-[a-z0-9]{3}$/.test(code), code)
  check(results, 'код комнаты: уникальность', newCode() !== code)
  check(results, 'код комнаты: нормализация', normalizeCode('  ABC-def_123  ') === 'abc-def123', normalizeCode('  ABC-def_123  '))
  check(results, 'код комнаты: дефисы не важны для ключа', roomId('abc-def-ghi') === roomId('abcdefghi'))
  check(
    results,
    'шифрование: дефисы не важны для ключа',
    decryptRoom('abc-def-ghi', encryptRoom('abcdefghi', 'данные')) === 'данные'
  )
  check(results, 'ключ комнаты: один код — один id', roomId(code) === roomId(normalizeCode(code)))
  check(results, 'ключ комнаты: разные коды — разные id', roomId(code) !== roomId(newCode()))
  check(results, 'ключ комнаты: id это sha256', roomId(code).length === 64, roomId(code))

  const secret = 'содержимое комнаты'
  const packed = encryptRoom(code, secret)
  check(results, 'шифрование: данные не видны', !packed.includes(secret))
  check(results, 'шифрование: расшифровка верна', decryptRoom(code, packed) === secret)
  let wrongKeyRejected = false
  try {
    decryptRoom(`${code}x`, packed)
  } catch {
    wrongKeyRejected = true
  }
  check(results, 'шифрование: чужой ключ не подходит', wrongKeyRejected)

  check(results, 'ссылка подключения: код из адреса', codeFromLink(`liro://connect/${code}`) === code, codeFromLink(`liro://connect/${code}`))
  check(results, 'ссылка подключения: путь со слешем', codeFromLink(`liro://connect/${code}/`) === code)
  check(results, 'ссылка подключения: чужой адрес', codeFromLink('https://example.com') === '')
  check(results, 'ссылка подключения: из аргументов', linkFromArgv(['Liro.exe', `liro://connect/${code}`]) === `liro://connect/${code}`)
  check(results, 'ссылка подключения: нет ссылки', linkFromArgv(['Liro.exe']) === '')

  check(
    results,
    'маршрут подключения',
    parseRoute(`#/join/${code}`).name === 'join' &&
      (parseRoute(`#/join/${code}`) as { code: string }).code === code
  )

  const tuple = (value: string): number[] => value.split('.').map((part) => Number(part) || 0)
  const notOlder = (left: string, right: string): boolean => {
    const a = tuple(left)
    const b = tuple(right)
    for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
      const delta = (a[index] ?? 0) - (b[index] ?? 0)
      if (delta !== 0) return delta > 0
    }
    return true
  }
  const sample = parseChanges(
    '- version: 1.2.3\n  notes:\n    - Первая строка\n    - Вторая строка\n\n- version: 1.2.2\n  notes:\n    - Одна строка\n'
  )
  check(results, 'изменения: версии', sample.length === 2 && sample[0].version === '1.2.3', JSON.stringify(sample))
  check(results, 'изменения: заметки', sample[0].notes.length === 2 && sample[1].notes[0] === 'Одна строка')
  check(results, 'изменения: пустая версия отбрасывается', parseChanges('- version: 1.0.0\n  notes:\n').length === 0)
  check(results, 'изменения: порядок версий', notOlder('1.14.9', '1.14.10') === false && notOlder('1.14.10', '1.14.9'))

  const shipped = readBundledChanges()
  check(results, 'файл изменений: читается', shipped.length > 0)
  check(
    results,
    'файл изменений: свежие версии сверху',
    shipped.every((entry, index) => index === 0 || notOlder(shipped[index - 1].version, entry.version))
  )
  check(
    results,
    'файл изменений: только про доску',
    shipped.every((entry) => entry.notes.every((note) => !/updater|asar|значк|обновл|electron|github|миро/i.test(note))),
    JSON.stringify(shipped.find((entry) => entry.notes.some((note) => /updater|asar|значк|обновл|electron|github|миро/i.test(note))))
  )
  check(
    results,
    'файл изменений: короткие строки',
    shipped.every((entry) => entry.notes.every((note) => note.length <= 120))
  )

  return results
}