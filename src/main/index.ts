import { app, BrowserWindow, Menu, session, shell } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getCapture, openBoardFile, registerIpc, setMainWindow } from './ipc'
import { buildExtensionFiles } from './import/extension'
import uiTestSource from './uitest.js?raw'
import { migrateLegacyData } from './paths'
import { store } from './store'
import { markAppStarted, startUpdater, stopUpdater } from './updater'
import { registerAssetProtocol } from './protocol'
import { codeFromLink, linkFromArgv, onLiveLink, registerLiveProtocol, setPendingLink } from './live/protocol'
import { startPairInstance } from './live/pair'

const isDev = !app.isPackaged
const windowIcon = join(__dirname, '../../resources/icon-256.png')

function argValue(flag: string): string {
  const prefix = `${flag}=`
  for (const value of process.argv) {
    if (value.startsWith(prefix)) return value.slice(prefix.length)
  }
  const at = process.argv.indexOf(flag)
  if (at < 0) return ''
  return process.argv[at + 1] ?? ''
}

let mainWindow: BrowserWindow | null = null

function boardFileArg(argv: string[]): string {
  for (const value of argv) {
    if (typeof value === 'string' && value.toLowerCase().endsWith('.liro') && existsSync(value)) return value
  }
  return ''
}

let startupHash = ''

const shotIndex = process.argv.indexOf('--shot')
const shotPath = shotIndex >= 0 ? process.argv[shotIndex + 1] : null
const hashIndex = process.argv.indexOf('--hash')
const shotHash = hashIndex >= 0 ? process.argv[hashIndex + 1] : ''
const uiTest = process.argv.includes('--uitest')
const uiHash = process.argv.includes('--uitest-hash')
  ? process.argv[process.argv.indexOf('--uitest-hash') + 1]
  : process.argv.includes('--hash')
    ? shotHash
    : ''

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1020,
    minHeight: 640,
    show: false,
    backgroundColor: '#fbfbfb',
    icon: existsSync(windowIcon) ? windowIcon : undefined,
    autoHideMenuBar: true,
    frame: false,
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 10, y: 9 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
      backgroundThrottling: false
    }
  })

  setMainWindow(mainWindow)

  mainWindow.webContents.once('did-finish-load', () => markAppStarted())

  mainWindow.on('ready-to-show', () => {
    if (!mainWindow) return
    if (!mainWindow.isMaximized()) mainWindow.maximize()
    mainWindow.show()
  })

  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('event:window:state', { maximized: true })
  })
  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('event:window:state', { maximized: false })
  })
  mainWindow.on('minimize', () => {
    if (!mainWindow) return
    mainWindow.webContents.send('event:window:state', { maximized: mainWindow.isMaximized(), minimized: true })
  })
  mainWindow.on('restore', () => {
    if (!mainWindow) return
    mainWindow.webContents.send('event:window:state', { maximized: mainWindow.isMaximized(), minimized: false })
  })
  mainWindow.on('closed', () => {
    setMainWindow(null)
    mainWindow = null
    stopUpdater()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!/^https?:/i.test(url)) return
    event.preventDefault()
    void shell.openExternal(url)
  })

  onLiveLink((url) => {
    const code = codeFromLink(url)
    if (!code) return
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
      mainWindow.webContents.send('event:live:join', code)
    }
  })

  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (uiTest) {
    const target = (() => {
      const id = /^#\/board\/(.+)$/.exec(uiHash || '')?.[1]
      if (id) return `#/board/${id}`
      const demo = store.boards().find((board) => {
        try {
          return store.readDoc(board.id).source.kind === 'demo'
        } catch {
          return false
        }
      })
      if (demo) return `#/board/${demo.id}`
      return '#/'
    })()
    const sceneIndex = process.argv.indexOf('--scene')
    const sceneHash = sceneIndex >= 0 ? process.argv[sceneIndex + 1] : ''
    const scriptIndex = process.argv.indexOf('--scene-script')
    const sceneScript = scriptIndex >= 0 ? readFileSync(process.argv[scriptIndex + 1], 'utf8') : ''
    if (sceneHash) {
      void mainWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: sceneHash })
      void mainWindow.webContents.once('did-finish-load', async () => {
        await new Promise((resolve) => setTimeout(resolve, 2800))
        try {
          if (sceneScript) await mainWindow!.webContents.executeJavaScript(`(async () => {${sceneScript}})()`)
        } catch (error) {
          console.error('сцена не выполнилась', error)
        }
        await new Promise((resolve) => setTimeout(resolve, 800))
        const result = sceneScript
          ? String(await mainWindow!.webContents.executeJavaScript('window.__sceneResult ? window.__sceneResult : ""'))
          : ''
        if (result) console.log(result)
        const extra = sceneScript
          ? (JSON.parse(
              String(
                await mainWindow!.webContents.executeJavaScript('window.__sceneShots ? JSON.stringify(window.__sceneShots) : "[]"')
              )
            ) as Array<{ path: string; wait?: number }>)
          : []
        for (const entry of extra) {
          await new Promise((resolve) => setTimeout(resolve, entry.wait ?? 400))
          const shot = await mainWindow!.webContents.capturePage()
          writeFileSync(entry.path, shot.toPNG())
        }
        const image = await mainWindow!.webContents.capturePage()
        writeFileSync(shotPath ?? '.shots/scene.png', image.toPNG())
        app.exit(0)
      })
      return
    }
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: target })
    void mainWindow.webContents.once('did-finish-load', async () => {
      await new Promise((resolve) => setTimeout(resolve, 2600))
      try {
        await mainWindow!.webContents.executeJavaScript(uiTestSource)
        const result = await mainWindow!.webContents.executeJavaScript(
          'window.__liroAppUiTest ? window.__liroAppUiTest() : Promise.resolve(JSON.stringify({ failed: 1, passed: 0, lines: ["скрипт проверки не загрузился"] }))'
        )
        const report = JSON.parse(String(result)) as { passed: number; failed: number; lines: string[] }
        for (const line of report.lines) console.log(line)
        console.log(`Проверок интерфейса пройдено: ${report.passed}, провалено: ${report.failed}`)
        app.exit(report.failed ? 1 : 0)
      } catch (error) {
        console.error('проверка интерфейса', error)
        app.exit(1)
      }
    })
  } else if (shotPath) {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: shotHash || '#/' })
    void mainWindow.webContents.once('did-finish-load', async () => {
      await new Promise((resolve) => setTimeout(resolve, 2600))
      const image = await mainWindow!.webContents.capturePage()
      writeFileSync(shotPath, image.toPNG())
      app.exit(0)
    })
  } else if (isDev && devUrl) {
    void mainWindow.loadURL(devUrl)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'), startupHash ? { hash: startupHash } : {})
  }
}

function buildMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'Файл',
      submenu: [
        {
          label: 'Вставить из буфера обмена',
          accelerator: 'CmdOrCtrl+Shift+V',
          click: () => {
            mainWindow?.webContents.send('event:nav:go', '#/')
          }
        },
        {
          label: 'Открыть файл доски…',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            mainWindow?.webContents.send('event:nav:go', '#/')
          }
        },
        { type: 'separator' },
        { label: 'Настройки', accelerator: 'CmdOrCtrl+,', click: () => mainWindow?.webContents.send('event:nav:go', '#/settings') },
        { type: 'separator' },
        { role: process.platform === 'darwin' ? 'close' : 'quit' }
      ]
    },
    {
      label: 'Правка',
      submenu: [
        {
          label: 'Отменить',
          accelerator: 'CmdOrCtrl+Z',
          click: () => mainWindow?.webContents.send('event:board:command', 'undo')
        },
        {
          label: 'Вернуть',
          accelerator: 'CmdOrCtrl+Y',
          click: () => mainWindow?.webContents.send('event:board:command', 'redo')
        },
        {
          label: 'Дублировать выделенное',
          accelerator: 'CmdOrCtrl+D',
          click: () => mainWindow?.webContents.send('event:board:command', 'duplicate')
        },
        {
          label: 'Удалить выделенное',
          accelerator: 'Delete',
          click: () => mainWindow?.webContents.send('event:board:command', 'delete')
        },
        { type: 'separator' },
        {
          label: 'Выделить всё',
          accelerator: 'CmdOrCtrl+A',
          click: () => mainWindow?.webContents.send('event:board:command', 'select-all')
        }
      ]
    },
    {
      label: 'Вид',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

app.setName('Liro')
migrateLegacyData()

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
    const boardFile = boardFileArg(argv)
    if (boardFile) {
      openBoardFile(boardFile)
      return
    }
    const link = linkFromArgv(argv)
    if (!link) return
    const code = codeFromLink(link)
    if (!code) return
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('event:live:join', code)
    }
  })

  void app.whenReady().then(async () => {
    if (process.argv.includes('--selftest')) {
      const { runSelfTest } = await import('./selftest')
      const result = runSelfTest()
      for (const failure of result.failures) console.error(`FAIL  ${failure}`)
      console.log(`Проверок пройдено: ${result.passed}, провалено: ${result.failed}`)
      app.exit(result.failed === 0 ? 0 : 1)
      return
    }
    if (process.argv.includes('--demo')) {
      const { seedDemoBoard } = await import('./demo')
      store.load()
      const id = seedDemoBoard()
      console.log(`Демо-доска: ${id}`)
      app.exit(0)
      return
    }
    if (process.argv.includes('--tools')) {
      store.load()
      const files = buildExtensionFiles()
      console.log(`Расширение: ${files.xpi}`)
      console.log(`Закладка: ${files.bookmarklet}`)
      app.exit(0)
      return
    }
    store.load()
    for (const board of store.index.boards.filter((item) => item.tags?.includes('сессия'))) {
      try {
        store.deleteDoc(board.id)
      } catch {
        continue
      }
    }
    const forcedName = argValue('--user-name')
    if (forcedName) {
      store.settings.userName = forcedName
      store.saveSettings()
    }
    if (uiTest) {
      const { ensureDemoBoard, resetDemoBoard } = await import('./demo')
      ensureDemoBoard()
      resetDemoBoard()
    }
    registerAssetProtocol()
    registerLiveProtocol()
    registerIpc()
    const launchFile = boardFileArg(process.argv)
    if (launchFile) {
      const docId = openBoardFile(launchFile)
      if (docId) startupHash = `#/board/${docId}`
    }
    buildMenu()
    try {
      await getCapture().start(47811, store.settings.captureToken)
    } catch (error) {
      console.error('collector server', error)
    }
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
    session.defaultSession.webRequest.onBeforeSendHeaders(
      { urls: ['*://*.youtube.com/*', '*://*.youtube-nocookie.com/*'] },
      (details, callback) => {
        callback({ requestHeaders: { ...details.requestHeaders, Referer: 'https://liro.app/' } })
      }
    )
    const launchLink = linkFromArgv(process.argv)
    if (launchLink) setPendingLink(launchLink)
    createWindow()
    startUpdater(() => mainWindow)
    if (process.argv.includes('--dev-pair')) startPairInstance()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('before-quit', () => {
    getCapture().dispose()
  })
}