import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import collectorSource from '@shared/page-collector.js?raw'
import { createZip, type ZipEntry } from '../util/zip'
import { getRoot } from '../paths'

const VERSION = '1.0.0'

const manifest = {
  manifest_version: 3,
  name: 'Liro — сбор доски',
  version: VERSION,
  description: 'Передаёт доску в настольное приложение Liro по локальному соединению.',
  browser_specific_settings: {
    gecko: { id: 'liro-local@liro.app', strict_min_version: '115.0' }
  },
  permissions: ['activeTab', 'scripting', 'storage'],
  host_permissions: [
    'https://miro.com/*',
    'https://api.miro.com/*',
    'https://*.miro.com/*',
    'https://*.mirostatic.com/*',
    'https://*.amazonaws.com/*',
    'https://*.amazon.com/*',
    'https://*.googleusercontent.com/*',
    'https://*.gstatic.com/*',
    'https://*.cloudfront.net/*',
    'http://127.0.0.1/*'
  ],
  action: {
    default_title: 'Собрать доску в Liro'
  },
  background: {
    scripts: ['background.js']
  },
  content_scripts: [
    {
      matches: ['https://miro.com/app/board/*'],
      js: ['content.js'],
      run_at: 'document_idle',
      all_frames: false
    }
  ],
  web_accessible_resources: [
    {
      resources: ['page-collector.js'],
      matches: ['https://miro.com/*']
    }
  ],
  icons: {}
}

const background = `const badge = (text, color) => {
  try {
    if (browser.action) browser.action.setBadgeText({ text })
    if (browser.browserAction) browser.browserAction.setBadgeText({ text })
    const api = browser.action || browser.browserAction
    if (api && api.setBadgeBackgroundColor) api.setBadgeBackgroundColor({ color: color || '#111111' })
  } catch (e) {}
}
const blobToDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('FileReader'))
    reader.readAsDataURL(blob)
  })
const fetchThroughExtension = async (url) => {
  try {
    const response = await fetch(url, { credentials: 'include', cache: 'no-store' })
    if (!response.ok) return { ok: false, error: 'HTTP ' + response.status }
    const type = response.headers.get('content-type') || ''
    if (type.indexOf('application/json') >= 0 || type.indexOf('text/') === 0) {
      const text = await response.text()
      return { ok: true, text }
    }
    const blob = await response.blob()
    if (blob.size < 1) return { ok: false, error: 'пустой ответ' }
    const dataUrl = await blobToDataUrl(blob)
    return { ok: true, dataUrl, mime: blob.type || type, bytes: blob.size }
  } catch (error) {
    return { ok: false, error: String((error && error.message) || error) }
  }
}
browser.runtime.onMessage.addListener((message, sender) => {
  if (!message) return undefined
  if (message.type === 'liro-fetch') {
    badge('..')
    return fetchThroughExtension(message.url).then((result) => {
      badge(result.ok ? 'OK' : '!', result.ok ? '#111111' : '#b91c1c')
      return result
    })
  }
  if (message.type !== 'liro') return undefined
  badge(message.text, message.error ? '#b91c1c' : '#111111')
  if (message.open) {
    fetch('http://127.0.0.1:' + (message.port || 47811) + '/ping', { cache: 'no-store' })
      .then(() => {})
      .catch(() => {})
  }
  return Promise.resolve({ ok: true })
})
browser.action.onClicked.addListener(async (tab) => {
  if (!tab || !tab.id) return
  try {
    await browser.tabs.sendMessage(tab.id, { type: 'liro-start' })
    badge('...', '#111111')
  } catch (e) {
    badge('!', '#b91c1c')
  }
})
`

const content = `let injected = false
const badge = (text, error) => {
  try {
    browser.runtime.sendMessage({ type: 'liro', text, error, port: 47811 })
  } catch (e) {}
}
const inject = () => {
  try {
    if (document.getElementById('liro-collector-source')) return
    const script = document.createElement('script')
    script.id = 'liro-collector-source'
    script.src = browser.runtime.getURL('page-collector.js')
    script.dataset.liro = '1'
    ;(document.head || document.documentElement).appendChild(script)
    script.addEventListener('load', () => script.remove())
  } catch (e) {
    badge('ошибка', true)
  }
}
window.addEventListener('message', (event) => {
  const data = event.data
  if (!data) return
  if (data.source === 'liro-collector') {
    if (data.status === 'done') badge('OK')
    return
  }
  if (data.source !== 'liro-collector-request' || !data.id || !data.url) return
  browser.runtime
    .sendMessage({ type: 'liro-fetch', url: data.url })
    .then((answer) => {
      window.postMessage(
        {
          source: 'liro-collector-response',
          id: data.id,
          ok: !!(answer && answer.ok),
          dataUrl: (answer && answer.dataUrl) || '',
          text: (answer && answer.text) || '',
          mime: (answer && answer.mime) || '',
          bytes: (answer && answer.bytes) || 0,
          error: (answer && answer.error) || ''
        },
        '*'
      )
    })
    .catch((error) => {
      window.postMessage(
        { source: 'liro-collector-response', id: data.id, ok: false, error: String((error && error.message) || error) },
        '*'
      )
    })
})
browser.runtime.onMessage.addListener((message) => {
  if (!message || message.type !== 'liro-start') return
  badge('...')
  inject()
  setTimeout(() => {
    try {
      window.__liroAppCollectorActive && window.__liroAppCollectorActive.run()
    } catch (e) {}
  }, 300)
  return Promise.resolve({ ok: true })
})
`

const bookmarkletPage = (code: string): string => `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>Liro — закладка</title>
<style>
  body { font: 15px/1.6 -apple-system, 'Segoe UI', Roboto, sans-serif; color: #111; background: #fafafa; margin: 0; padding: 40px; }
  .card { max-width: 720px; margin: 0 auto; background: #fff; border: 1px solid #e3e3e3; border-radius: 16px; padding: 32px; }
  h1 { font-size: 22px; margin: 0 0 8px; }
  p { margin: 0 0 16px; color: #444; }
  a.bookmark { display: inline-block; padding: 12px 20px; border-radius: 10px; background: #111; color: #fff; text-decoration: none; font-weight: 600; cursor: grab; }
  a.bookmark:active { cursor: grabbing; }
  ol { padding-left: 20px; color: #444; }
  code { background: #f2f2f2; padding: 2px 6px; border-radius: 6px; font-size: 13px; }
</style>
</head>
<body>
<div class="card">
  <h1>Закладка «Собрать доску в Liro»</h1>
  <p>Перетащите кнопку на панель закладок Firefox. Затем откройте доску и нажмите закладку — приложение Liro получит все элементы и картинки.</p>
  <p><a class="bookmark" href="javascript:${code}">Собрать доску</a></p>
  <ol>
    <li>Откройте доску и дождитесь полной загрузки.</li>
    <li>Нажмите закладку на панели — в углу экрана появится отчёт о сборе.</li>
    <li>Вернитесь в Liro и нажмите «Принять собранные данные».</li>
  </ol>
</div>
</body>
</html>`

export function buildExtensionFiles(): { xpi: string; bookmarklet: string; toolsDir: string } {
  const toolsDir = join(getRoot(), 'tools')
  mkdirSync(toolsDir, { recursive: true })
  const entries: ZipEntry[] = [
    { name: 'manifest.json', data: Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'), store: true },
    { name: 'background.js', data: Buffer.from(background, 'utf8'), store: true },
    { name: 'content.js', data: Buffer.from(content, 'utf8'), store: true },
    { name: 'page-collector.js', data: Buffer.from(collectorSource, 'utf8'), store: true },
    { name: 'README.txt', data: Buffer.from(readme(), 'utf8'), store: true }
  ]
  const xpi = join(toolsDir, 'liro-collector.xpi')
  writeFileSync(xpi, createZip(entries))
  const bookmarklet = join(toolsDir, 'liro-bookmarklet.html')
  writeFileSync(bookmarklet, bookmarkletPage(bookmarkletCode()), 'utf8')
  return { xpi, bookmarklet, toolsDir }
}

function bookmarkletCode(): string {
  const compact = collectorSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  return encodeURIComponent(`(()=>{${compact}})();`)
}

function readme(): string {
  return [
    'Liro — сбор доски',
    '',
    'Установка расширения в Firefox:',
    '1. Откройте about:debugging#/runtime/this-firefox',
    '2. Нажмите «Загрузить временное дополнение…»',
    '3. Выберите файл liro-collector.xpi',
    '4. Откройте доску и нажмите на иконку расширения в панели инструментов.',
    '',
    'Расширение работает только на странице доски и передаёт данные',
    'на локальный сервер 127.0.0.1 вашего компьютера.'
  ].join('\n')
}