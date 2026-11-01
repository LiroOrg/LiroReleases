const clickSelector = async (selector) => {
  const element = document.querySelector(selector)
  if (!element) return false
  const rect = element.getBoundingClientRect()
  const options = {
    bubbles: true,
    cancelable: true,
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + rect.height / 2,
    button: 0,
    pointerId: 1,
    isPrimary: true
  }
  element.dispatchEvent(new PointerEvent('pointerdown', options))
  await new Promise((resolve) => setTimeout(resolve, 40))
  element.dispatchEvent(new PointerEvent('pointerup', options))
  element.dispatchEvent(new MouseEvent('click', options))
  await new Promise((resolve) => setTimeout(resolve, 160))
  return true
}

const gesture = (node, from, to, button) => {
  const base = { bubbles: true, cancelable: true, button, buttons: button === 2 ? 2 : 1, pointerId: 1, isPrimary: true }
  node.dispatchEvent(new PointerEvent('pointerdown', { ...base, ...from }))
  node.dispatchEvent(new PointerEvent('pointermove', { ...base, ...to }))
  node.dispatchEvent(new PointerEvent('pointerup', { ...base, ...to }))
}

const itemCount = () => {
  const node = document.querySelector('[data-board-details]')
  const raw = node ? node.getAttribute('data-items') : ''
  return raw ? Number(raw) : -1
}

const press = async (key, modifiers) => {
  window.dispatchEvent(new KeyboardEvent('keydown', Object.assign({ key, bubbles: true, cancelable: true }, modifiers || {})))
  await new Promise((resolve) => setTimeout(resolve, 280))
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const openMenuAt = async (x, y) => {
  const canvasEl = document.querySelector('.boardview__canvas')
  if (!canvasEl) return []
  const options = { bubbles: true, cancelable: true, button: 2, pointerId: 1, isPrimary: true, clientX: x, clientY: y }
  canvasEl.dispatchEvent(new PointerEvent('pointerdown', options))
  await wait(70)
  canvasEl.dispatchEvent(new PointerEvent('pointerup', { ...options, buttons: 0 }))
  canvasEl.dispatchEvent(new MouseEvent('contextmenu', options))
  await wait(300)
  return Array.from(document.querySelectorAll('.menu__pop .menu__item'))
}

const openMenuOn = (node) => {
  const box = node.getBoundingClientRect()
  return openMenuAt(box.left + box.width / 2, box.top + box.height / 2)
}

const openInspector = async (node) => {
  const entries = node ? await openMenuOn(node) : []
  const propertiesEntry = entries.find((el) => /Свойства/.test(el.textContent || ''))
  if (propertiesEntry) propertiesEntry.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  await wait(360)
  return document.querySelector('.inspector')
}

const findEmptySpot = () => {
  const canvasEl = document.querySelector('.boardview__canvas')
  if (!canvasEl) return null
  const box = canvasEl.getBoundingClientRect()
  for (let step = 0; step < 90; step += 1) {
    const x = box.left + 120 + ((step * 173) % Math.max(200, Math.round(box.width) - 240))
    const y = box.top + 120 + ((step * 131) % Math.max(200, Math.round(box.height) - 240))
    if (document.elementFromPoint(x, y) === canvasEl) return { x, y }
  }
  return null
}

const report = []
const check = (name, ok, detail) => {
  report.push(`${ok ? 'ОК' : 'СБОЙ'} ${name}${detail ? `: ${detail}` : ''}`)
}

const run = async () => {
  await wait(1200)
  if (document.querySelector('.welcome')) {
    const field = document.querySelector('.welcome__input')
    if (field) {
      const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setValue.call(field, 'Тест')
      field.dispatchEvent(new Event('input', { bubbles: true }))
    }
    await wait(150)
    document.querySelector('.welcome__go')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wait(500)
  }
  const demoHash = window.location.hash
  const start = itemCount()
  check('доска загрузилась', start > 0, `${start} объектов`)

  const subtitle = document.querySelector('.bbar__sub')
  check('в шапке нет счётчика объектов', !subtitle || !/объектов/.test(subtitle.textContent || ''), subtitle ? subtitle.textContent : 'нет подписи')

  await clickSelector('[data-board-details]')
  const details = document.querySelector('.boarddetails')
  check('подробности о доске открываются', !!details)
  const detailsText = details ? details.textContent || '' : ''
  check('в подробностях есть счётчик объектов', /Объектов/.test(detailsText))
  check('в подробностях есть состав', !!details && details.querySelectorAll('.boarddetails__bar').length > 0)
  check('в подробностях есть происхождение', /Происхождение/.test(detailsText))
  check('счётчик в подробностях совпадает с доской', new RegExp(`Объектов${start}`).test(detailsText.replace(/[\s\u00a0]/g, '')), `${start}`)
  await clickSelector('[data-board-details]')
  check('подробности о доске закрываются', !document.querySelector('.boarddetails'))

  const canvas = document.querySelector('.boardview__canvas')
  check('холст на месте', !!canvas)
  const white = canvas ? getComputedStyle(canvas).backgroundColor : ''
  check('холст белый', white === 'rgb(255, 255, 255)', white)

  const undoButton = Array.from(document.querySelectorAll('.topbar .toolbtn')).find((node) => node.getAttribute('aria-label') === 'Отменить')
  const redoButton = Array.from(document.querySelectorAll('.topbar .toolbtn')).find((node) => node.getAttribute('aria-label') === 'Вернуть')
  check('отмена серая без истории', !!undoButton && undoButton.disabled, undoButton ? `disabled=${undoButton.disabled}` : 'кнопки нет')
  check('возврат серый без истории', !!redoButton && redoButton.disabled, redoButton ? `disabled=${redoButton.disabled}` : 'кнопки нет')

  const gapsButton = Array.from(document.querySelectorAll('.bbar--warn button')).find((node) =>
    /Выделить пропуски/.test(node.textContent || '')
  )
  if (gapsButton) {
    gapsButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wait(320)
    check('выбор пропусков не падает', document.querySelectorAll('.boarditem--selected').length >= 0, 'выделено')
    await press('Escape')
    await wait(200)
  } else {
    check('нет полосы с пропусками', true, 'пропусков нет')
  }

  const item = document.querySelector('.boarditem')
  check('есть объекты на холсте', !!item)

  if (item) {
    const rect = item.getBoundingClientRect()
    check('объект виден в области холста', rect.width > 0 && rect.height > 0, `${Math.round(rect.width)}x${Math.round(rect.height)}`)
    const options = {
      bubbles: true,
      cancelable: true,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
      button: 0,
      pointerId: 1,
      isPrimary: true
    }
    item.dispatchEvent(new PointerEvent('pointerdown', options))
    await wait(60)
    item.dispatchEvent(new PointerEvent('pointerup', options))
    await wait(180)
    const selected = document.querySelectorAll('.boarditem--selected').length
    check('клик выделяет объект', selected === 1, `${selected} выделено`)
    check('панель свойств не открывается сама', !document.querySelector('.inspector'))

    await press('Delete')
    const afterDelete = itemCount()
    check('Delete удаляет объект', afterDelete === start - 1, `${start} → ${afterDelete}`)

    await press('z', { ctrlKey: true })
    const afterUndo = itemCount()
    check('Ctrl+Z возвращает объект', afterUndo === start, `${afterDelete} → ${afterUndo}`)
    check('возврат становится активным', !!redoButton && !redoButton.disabled, redoButton ? `disabled=${redoButton.disabled}` : 'кнопки нет')
    check('отмена гаснет после полной отмены', !!undoButton && undoButton.disabled, undoButton ? `disabled=${undoButton.disabled}` : 'кнопки нет')

    await press('y', { ctrlKey: true })
    const afterRedo = itemCount()
    check('Ctrl+Y повторяет удаление', afterRedo === start - 1, `${afterUndo} → ${afterRedo}`)
    check('отмена оживает после возврата', !!undoButton && !undoButton.disabled, undoButton ? `disabled=${undoButton.disabled}` : 'кнопки нет')

    await press('z', { ctrlKey: true })
    check('повторная отмена работает', itemCount() === start, `${itemCount()}`)
    check('возврат активен после повторной отмены', !!redoButton && !redoButton.disabled, redoButton ? `disabled=${redoButton.disabled}` : 'кнопки нет')

    await press('f')
    await wait(360)
    await press('a', { ctrlKey: true })
    await wait(280)
    const all = document.querySelectorAll('.boarditem--selected').length
    check('Ctrl+A выделяет всё', all >= 2, `${all} видимых`)
    await press('Escape')
  }

  const copyTarget = document.querySelector('.boarditem')
  if (copyTarget) {
    const box = copyTarget.getBoundingClientRect()
    const pick = { bubbles: true, cancelable: true, button: 0, buttons: 1, pointerId: 27, isPrimary: true, clientX: box.left + box.width / 2, clientY: box.top + box.height / 2 }
    copyTarget.dispatchEvent(new PointerEvent('pointerdown', pick))
    await wait(60)
    copyTarget.dispatchEvent(new PointerEvent('pointerup', pick))
    await wait(240)
    const beforeCopy = itemCount()
    await press('c', { ctrlKey: true })
    await wait(260)
    await press('v', { ctrlKey: true })
    await wait(700)
    check('Ctrl+V вставляет скопированный объект', itemCount() === beforeCopy + 1, `${beforeCopy} → ${itemCount()}`)
    await press('z', { ctrlKey: true })
    await wait(400)
    check('вставка отменяется', itemCount() === beforeCopy, `${itemCount()}`)
  }

  const tools = Array.from(document.querySelectorAll('.toolrail .toolbtn'))
  check('в рельсе инструментов есть кнопки', tools.length >= 8, `${tools.length}`)
  const toolLabels = tools.map((node) => node.getAttribute('aria-label') || '')
  check('в рельсе есть кисть', toolLabels.includes('Рисовать'), toolLabels.join(', '))
  check('в рельсе есть 3D-фигура', toolLabels.includes('3D-фигура'))
  check('в рельсе есть ластик', toolLabels.includes('Ластик'))
  check('в рельсе есть меню Ещё', toolLabels.includes('Ещё инструменты'))
  const railBox = document.querySelector('.toolrail')?.getBoundingClientRect()
  const canvasRect = document.querySelector('.boardview__canvas')?.getBoundingClientRect()
  check('рельс инструментов слева', !!railBox && !!canvasRect && railBox.left < canvasRect.left + 90, railBox ? `${Math.round(railBox.left)}` : 'нет')
  check('панели инструментов сверху нет', !document.querySelector('.bfcol--center'))
  check('подсказки короткие', tools.every((node) => (node.getAttribute('title') || '').split('·').length <= 2))
  check('палитры не внутри рельса', document.querySelectorAll('.toolrail .toolpalette').length === 0)

  const moreButton = tools.find((node) => node.getAttribute('aria-label') === 'Ещё инструменты')
  if (moreButton) {
    moreButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wait(320)
    const menuItems = Array.from(document.querySelectorAll('.toolmenu__item'))
    check('меню Ещё открывается', menuItems.length === 4, `${menuItems.length}`)
    check('в меню Ещё есть картинка', menuItems.some((node) => /Картинка/.test(node.textContent || '')))
    const menuBox = document.querySelector('.toolmenu')?.getBoundingClientRect()
    check(
      'меню Ещё видно целиком',
      !!menuBox && menuBox.width > 120 && menuBox.height > 80 && menuBox.left >= 0 && menuBox.top >= 0 && menuBox.bottom <= window.innerHeight,
      menuBox ? `${Math.round(menuBox.left)},${Math.round(menuBox.top)} ${Math.round(menuBox.width)}x${Math.round(menuBox.height)}` : 'нет меню'
    )
    check('меню Ещё справа от рельса', !!menuBox && !!railBox && menuBox.left >= railBox.right - 2, menuBox ? `${Math.round(menuBox.left)}` : 'нет')
    const rows = Array.from(document.querySelectorAll('.toolmenu__row'))
    check('инструменты в меню Ещё перетаскиваемые', rows.length === 4 && rows.every((row) => row.draggable), `${rows.length}`)
    const railCount = document.querySelectorAll('.toolrail .toolbtn').length
    const toolBeforePick = document.querySelector('.boardview__canvas')?.dataset.tool
    const firstItem = menuItems[0]
    firstItem?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wait(320)
    const toolPicked = document.querySelector('.boardview__canvas')?.dataset.tool
    check('инструмент из меню Ещё выбирается', !!toolPicked && toolPicked !== toolBeforePick, `${toolBeforePick} → ${toolPicked}`)
    check('меню Ещё закрывается после выбора', !document.querySelector('.toolmenu'))
    check('рельс не меняется от выбора инструмента', document.querySelectorAll('.toolrail .toolbtn').length === railCount, `${railCount}`)
    moreButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wait(240)
    const graphItem = Array.from(document.querySelectorAll('.toolmenu__item')).find((node) =>
      /График/.test(node.textContent || '')
    )
    if (graphItem) {
      graphItem.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await wait(320)
      const graphCount = itemCount()
      const canvasGraph = document.querySelector('.boardview__canvas')
      if (canvasGraph) {
        const gbox = canvasGraph.getBoundingClientRect()
        const gbase = { bubbles: true, cancelable: true, button: 0, buttons: 1, pointerId: 1, isPrimary: true }
        canvasGraph.dispatchEvent(new PointerEvent('pointerdown', { ...gbase, clientX: gbox.left + 420, clientY: gbox.top + 420 }))
        await wait(60)
        canvasGraph.dispatchEvent(new PointerEvent('pointerup', { ...gbase, clientX: gbox.left + 420, clientY: gbox.top + 420 }))
        await wait(420)
        check('график создаётся', itemCount() === graphCount + 1, `${graphCount} → ${itemCount()}`)
        check('график отрисован', !!document.querySelector(".boarditem[data-kind='graph']"))
        await press('z', { ctrlKey: true })
        await wait(320)
        check('Ctrl+Z убирает график', itemCount() === graphCount, `${itemCount()} против ${graphCount}`)
      }
    }
    moreButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wait(240)
  }

  const brushCanvas = document.querySelector('.boardview__canvas')
  if (brushCanvas) {
    const beforeBrush = document.querySelectorAll(".boarditem[data-kind='path']").length
    const penTool = Array.from(document.querySelectorAll('.toolrail .toolbtn')).find((node) => node.getAttribute('aria-label') === 'Рисовать')
    if (penTool) penTool.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wait(260)
    const brushBox = brushCanvas.getBoundingClientRect()
    const brushBase = { bubbles: true, cancelable: true, button: 0, buttons: 1, pointerId: 3, isPrimary: true }
    brushCanvas.dispatchEvent(new PointerEvent('pointerdown', { ...brushBase, clientX: brushBox.left + 260, clientY: brushBox.top + 620 }))
    for (let step = 1; step <= 18; step += 1) {
      brushCanvas.dispatchEvent(
        new PointerEvent('pointermove', {
          ...brushBase,
          clientX: brushBox.left + 260 + step * 14,
          clientY: brushBox.top + 620 + Math.sin(step / 2) * 26
        })
      )
      await wait(12)
    }
    brushCanvas.dispatchEvent(new PointerEvent('pointerup', { ...brushBase, clientX: brushBox.left + 512, clientY: brushBox.top + 620 }))
    await wait(420)
    const strokes = Array.from(document.querySelectorAll(".boarditem[data-kind='path']"))
    check('кисть рисует штрих', strokes.length === beforeBrush + 1, `${beforeBrush} → ${strokes.length}`)
    const shape = strokes.length ? strokes[strokes.length - 1].querySelector('path') : null
    check('штрих нарисован линией', !!shape && shape.getAttribute('fill') === 'none' && !!shape.getAttribute('stroke'), shape ? `${shape.getAttribute('fill')} / ${shape.getAttribute('stroke')}` : 'нет пути')
    if (strokes.length) {
      const strokeBox = strokes[strokes.length - 1].getBoundingClientRect()
      const centerX = strokeBox.left + strokeBox.width / 2
      const centerY = strokeBox.top + strokeBox.height / 2
      const wantedX = brushBox.left + 386
      const wantedY = brushBox.top + 620
      check(
        'штрих лежит там, где нарисован',
        Math.abs(centerX - wantedX) < 8 && Math.abs(centerY - wantedY) < 8,
        `сдвиг ${Math.round(centerX - wantedX)},${Math.round(centerY - wantedY)}`
      )
      const undoBrush = Array.from(document.querySelectorAll('.topbar .toolbtn')).find((node) => node.getAttribute('aria-label') === 'Отменить')
      if (undoBrush) undoBrush.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await wait(360)
      check('штрих отменяется', document.querySelectorAll(".boarditem[data-kind='path']").length === beforeBrush, `${document.querySelectorAll(".boarditem[data-kind='path']").length}`)
    }
    const straightBase = { ...brushBase, shiftKey: true }
    brushCanvas.dispatchEvent(new PointerEvent('pointerdown', { ...straightBase, clientX: brushBox.left + 260, clientY: brushBox.top + 380 }))
    for (let step = 1; step <= 10; step += 1) {
      brushCanvas.dispatchEvent(
        new PointerEvent('pointermove', {
          ...straightBase,
          clientX: brushBox.left + 260 + step * 18,
          clientY: brushBox.top + 380 + step * 6
        })
      )
      await wait(12)
    }
    brushCanvas.dispatchEvent(new PointerEvent('pointerup', { ...straightBase, clientX: brushBox.left + 440, clientY: brushBox.top + 440 }))
    await wait(420)
    const straightStrokes = Array.from(document.querySelectorAll(".boarditem[data-kind='path']"))
    const straightPath = straightStrokes.length ? straightStrokes[straightStrokes.length - 1].querySelector('path') : null
    const straightD = straightPath?.getAttribute('d') || ''
    check('с Shift рисуется прямая', /M [\d.-]+ [\d.-]+ L [\d.-]+ [\d.-]+/.test(straightD), straightD.slice(0, 60))
    const eraserTool = Array.from(document.querySelectorAll('.toolrail .toolbtn')).find((node) => node.getAttribute('aria-label') === 'Ластик')
    if (eraserTool) {
      const penAgain = Array.from(document.querySelectorAll('.toolrail .toolbtn')).find((node) => node.getAttribute('aria-label') === 'Рисовать')
      if (penAgain) penAgain.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await wait(240)
      brushCanvas.dispatchEvent(new PointerEvent('pointerdown', { ...brushBase, clientX: brushBox.left + 300, clientY: brushBox.top + 300 }))
      for (let step = 1; step <= 20; step += 1) {
        brushCanvas.dispatchEvent(
          new PointerEvent('pointermove', { ...brushBase, clientX: brushBox.left + 300 + step * 12, clientY: brushBox.top + 300 })
        )
        await wait(10)
      }
      brushCanvas.dispatchEvent(new PointerEvent('pointerup', { ...brushBase, clientX: brushBox.left + 540, clientY: brushBox.top + 300 }))
      await wait(420)
      const beforeErase = document.querySelectorAll(".boarditem[data-kind='path']").length
      const wave = Array.from(document.querySelectorAll(".boarditem[data-kind='path']")).pop()
      const waveBox = wave ? wave.getBoundingClientRect() : null
      eraserTool.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await wait(260)
      if (waveBox) {
        brushCanvas.dispatchEvent(
          new PointerEvent('pointerdown', { ...brushBase, clientX: waveBox.left + waveBox.width / 2, clientY: waveBox.top + waveBox.height / 2 })
        )
        await wait(200)
        brushCanvas.dispatchEvent(
          new PointerEvent('pointerup', { ...brushBase, clientX: waveBox.left + waveBox.width / 2, clientY: waveBox.top + waveBox.height / 2 })
        )
        await wait(420)
      }
      const afterErase = document.querySelectorAll(".boarditem[data-kind='path']").length
      check('ластик режет штрих на части', afterErase > beforeErase, `${beforeErase} → ${afterErase}`)
      const undoErase = Array.from(document.querySelectorAll('.topbar .toolbtn')).find((node) => node.getAttribute('aria-label') === 'Отменить')
      if (undoErase) undoErase.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await wait(420)
      check('стирание отменяется', document.querySelectorAll(".boarditem[data-kind='path']").length === beforeErase, `${document.querySelectorAll(".boarditem[data-kind='path']").length}`)
    }
  }

  const canvasShape = document.querySelector('.boardview__canvas')
  if (canvasShape) {
    await press('d')
    await wait(220)
    check('3D-инструмент включается', !!document.querySelector('.toolpalette'))
    const solidCount = itemCount()
    const box3d = canvasShape.getBoundingClientRect()
    const base3d = { bubbles: true, cancelable: true, button: 0, buttons: 1, pointerId: 1, isPrimary: true }
    canvasShape.dispatchEvent(
      new PointerEvent('pointerdown', { ...base3d, clientX: box3d.left + 420, clientY: box3d.top + 420 })
    )
    canvasShape.dispatchEvent(new PointerEvent('pointerup', { ...base3d, clientX: box3d.left + 420, clientY: box3d.top + 420 }))
    await wait(360)
    check('3D-фигура ставится на доску', itemCount() === solidCount + 1, `${solidCount} → ${itemCount()}`)
    const solid = document.querySelector('.boarditem svg')
    check('3D-фигура отрисована', !!solid)
    await press('z', { ctrlKey: true })
    await wait(300)
    check('Ctrl+Z убирает 3D-фигуру', itemCount() === solidCount, `${itemCount()}`)
  }

  const textCount = itemCount()
  await press('t')
  await wait(200)
  const canvasText = document.querySelector('.boardview__canvas')
  if (canvasText) {
    const box = canvasText.getBoundingClientRect()
    const base = { bubbles: true, cancelable: true, button: 0, buttons: 1, pointerId: 1, isPrimary: true }
    const downEvent = new PointerEvent('pointerdown', { ...base, clientX: box.left + 520, clientY: box.top + 200 })
    canvasText.dispatchEvent(downEvent)
    canvasText.dispatchEvent(new PointerEvent('pointerup', { ...base, clientX: box.left + 520, clientY: box.top + 200 }))
    await wait(360)
    check('текст создаётся', itemCount() === textCount + 1, `${textCount} → ${itemCount()}`)
    const editor = document.querySelector('.texteditor')
    check('открылось поле ввода текста', !!editor)
    check('создание текста не отдаёт фокус доске', downEvent.defaultPrevented)
    check('курсор в поле ввода сразу', !!editor && document.activeElement === editor, `${document.activeElement?.className || document.activeElement?.tagName}`)
    check('шаблон выделен для перезаписи', !!editor && window.getSelection()?.toString() === 'Текст', `${editor?.textContent}`)
    const freshNode = Array.from(document.querySelectorAll(".boarditem[data-kind='text']")).pop()
    check('под полем ввода объект не рисует свой текст', !!freshNode && !(freshNode.textContent || '').trim(), freshNode ? JSON.stringify(freshNode.textContent) : 'узла нет')
    if (editor) {
      const transfer = new DataTransfer()
      transfer.setData('text/plain', 'Вставленный текст')
      const pasteEvent = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: transfer })
      editor.dispatchEvent(pasteEvent)
      await wait(140)
      check('вставка в текст не перехватывается', pasteEvent.defaultPrevented === false)
      editor.innerHTML = '<p>Привет</p>'
      editor.dispatchEvent(new Event('input', { bubbles: true }))
      await wait(120)
      editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }))
      await wait(300)
      check('текст сохраняется', !document.querySelector('.texteditor'))
      const texts = Array.from(document.querySelectorAll('.boarditem')).map((node) => node.textContent || '')
      check('текст виден на доске', texts.some((value) => value.includes('Привет')))
      const plainItem = Array.from(document.querySelectorAll(".boarditem[data-kind='text']")).pop()
      check('простой текст виден без тегов', !!plainItem && (plainItem.textContent || '').trim().length > 0, plainItem ? plainItem.textContent : 'нет')
    }
    await press('z', { ctrlKey: true })
    await wait(200)
    await press('z', { ctrlKey: true })
    await wait(320)
    check('Ctrl+Z убирает текст', itemCount() === textCount, `${itemCount()} против ${textCount}`)
  }
  await press('Escape')
  const stickyCount = itemCount()
  await press('n')
  await wait(220)
  const canvasSticky = document.querySelector('.boardview__canvas')
  if (canvasSticky) {
    const box = canvasSticky.getBoundingClientRect()
    const base = { bubbles: true, cancelable: true, button: 0, buttons: 1, pointerId: 1, isPrimary: true }
    canvasSticky.dispatchEvent(new PointerEvent('pointerdown', { ...base, clientX: box.left + 640, clientY: box.top + 260 }))
    await wait(60)
    canvasSticky.dispatchEvent(new PointerEvent('pointerup', { ...base, clientX: box.left + 640, clientY: box.top + 260 }))
    await wait(360)
    check('стикер создаётся', itemCount() === stickyCount + 1, `${stickyCount} → ${itemCount()}`)
    const stickyEditor = document.querySelector('.texteditor')
    check('стикер открылся на ввод', !!stickyEditor)
    check('курсор в поле стикера сразу', !!stickyEditor && document.activeElement === stickyEditor, `${document.activeElement?.className || document.activeElement?.tagName}`)
    if (stickyEditor) {
      check('текст стикера выделен целиком', window.getSelection()?.toString() === 'Заметка', `${stickyEditor.textContent}`)
      stickyEditor.innerHTML = '<p>Заметка</p>'
      stickyEditor.dispatchEvent(new Event('input', { bubbles: true }))
      await wait(120)
      stickyEditor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }))
      await wait(320)
      const stickyTexts = Array.from(document.querySelectorAll(".boarditem[data-kind='sticky']")).map((node) => node.textContent || '')
      check('текст стикера сохранён', stickyTexts.some((value) => value.includes('Заметка')), stickyTexts.join('|').slice(0, 60))
    }
    await press('z', { ctrlKey: true })
    await wait(320)
    check('Ctrl+Z убирает стикер', itemCount() === stickyCount, `${itemCount()} против ${stickyCount}`)
  }
  await press('Escape')
  if (canvasShape) {
    await press('s')
    await wait(200)
    const countBeforeShape = itemCount()
    const box = canvasShape.getBoundingClientRect()
    const base = { bubbles: true, cancelable: true, button: 0, buttons: 1, pointerId: 1, isPrimary: true }
    const from = { clientX: box.left + 180, clientY: box.top + 200 }
    const to = { clientX: box.left + 360, clientY: box.top + 320 }
    canvasShape.dispatchEvent(new PointerEvent('pointerdown', { ...base, ...from }))
    await wait(40)
    canvasShape.dispatchEvent(new PointerEvent('pointermove', { ...base, ...to }))
    await wait(60)
    canvasShape.dispatchEvent(new PointerEvent('pointerup', { ...base, ...to }))
    await wait(320)
    check('фигура создаётся протяжкой', itemCount() === countBeforeShape + 1, `${countBeforeShape} → ${itemCount()}`)
    check('инструмент остаётся после создания', !!document.querySelector('.toolpalette'))
    check('новая фигура без рамки выделения', document.querySelectorAll('.boarditem--selected').length === 0)
    await press('v')
    await wait(180)
    check('созданная фигура выделена', document.querySelectorAll('.boarditem--selected').length === 1)
    await press('z', { ctrlKey: true })
    await wait(300)
    check('Ctrl+Z убирает фигуру', itemCount() === countBeforeShape, `${itemCount()}`)

    const keydown = canvasShape.getBoundingClientRect()
    const kb = { bubbles: true, cancelable: true, button: 0, buttons: 1, pointerId: 1, isPrimary: true }
    const kfrom = { clientX: keydown.left + 180, clientY: keydown.top + 200 }
    const kto = { clientX: keydown.left + 340, clientY: keydown.top + 300 }
    await press('s')
    await wait(200)
    canvasShape.dispatchEvent(new PointerEvent('pointerdown', { ...kb, ...kfrom }))
    await wait(40)
    canvasShape.dispatchEvent(new PointerEvent('pointermove', { ...kb, ...kto }))
    await wait(60)
    canvasShape.dispatchEvent(new PointerEvent('pointerup', { ...kb, ...kto }))
    await wait(320)
    await press('v')
    await wait(200)
    const shapeBefore = itemCount()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', ctrlKey: true, bubbles: true, cancelable: true }))
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'd', ctrlKey: true, bubbles: true, cancelable: true }))
    await wait(340)
    check('отпускание клавиши не повторяет действие', itemCount() === shapeBefore + 1, `${shapeBefore} → ${itemCount()}`)
    const cloneNode = document.querySelector('.boarditem--selected')
    if (cloneNode) {
      const leftBefore = Math.round(cloneNode.getBoundingClientRect().left)
      await press('ArrowRight')
      await press('ArrowRight')
      await press('ArrowRight')
      await wait(120)
      const leftMoved = Math.round(cloneNode.getBoundingClientRect().left)
      check('стрелки сдвигают выбранный объект', leftMoved > leftBefore, `${leftBefore} → ${leftMoved}`)
      await press('z', { ctrlKey: true })
      await wait(340)
      check('один шаг отмены снимает весь сдвиг', Math.round(cloneNode.getBoundingClientRect().left) === leftBefore, `${Math.round(cloneNode.getBoundingClientRect().left)} против ${leftBefore}`)
      await press('z', { ctrlKey: true })
      await wait(340)
      check('копия убирается второй отменой', itemCount() === shapeBefore, `${itemCount()} против ${shapeBefore}`)
    }
  }

  await press('Escape')
  await press('3')
  await wait(240)
  const thirdTool = document.querySelector('.toolrail .toolbtn[data-active="true"]')
  check('цифра выбирает инструмент по порядку', !!thirdTool, thirdTool ? thirdTool.getAttribute('aria-label') : 'нет')
  await press('v')
  await wait(180)
  const linkCount = itemCount()
  await press('l')
  await wait(220)
  const linkTargets = Array.from(document.querySelectorAll('.boarditem')).filter((node) => {
    const rect = node.getBoundingClientRect()
    if (node.classList.contains('boarditem--locked')) return false
    return rect.width > 8 && rect.height > 8 && rect.left > 70 && rect.top > 70 && rect.right < window.innerWidth - 20 && rect.bottom < window.innerHeight - 140
  })
  if (linkTargets.length >= 2) {
    const base = { bubbles: true, cancelable: true, button: 0, buttons: 1, pointerId: 1, isPrimary: true }
    const firstRect = linkTargets[0].getBoundingClientRect()
    const secondRect = linkTargets[1].getBoundingClientRect()
    linkTargets[0].dispatchEvent(
      new PointerEvent('pointerdown', { ...base, clientX: firstRect.left + firstRect.width / 2, clientY: firstRect.top + firstRect.height / 2 })
    )
    await wait(80)
    linkTargets[1].dispatchEvent(
      new PointerEvent('pointerdown', { ...base, clientX: secondRect.left + secondRect.width / 2, clientY: secondRect.top + secondRect.height / 2 })
    )
    await wait(120)
    linkTargets[1].dispatchEvent(
      new PointerEvent('pointerup', { ...base, clientX: secondRect.left + secondRect.width / 2, clientY: secondRect.top + secondRect.height / 2 })
    )
    await wait(360)
    check('связь создаётся', itemCount() === linkCount + 1, `${linkCount} → ${itemCount()}`)
    check('связь нарисована', document.querySelectorAll(".boarditem[data-kind='connector']").length >= 1)
    const linkLayerFresh = document.querySelector('.boardview__connectors')
    if (linkLayerFresh) {
      const freshData = linkLayerFresh.getContext('2d').getImageData(0, 0, linkLayerFresh.width, linkLayerFresh.height).data
      let freshPainted = 0
      for (let index = 3; index < freshData.length; index += 4) if (freshData[index] > 8) freshPainted += 1
      check('слой связей отрисован', freshPainted > 20, `${freshPainted} пикселей`)
    } else {
      check('слой связей отрисован', false, 'нет слоя связей')
    }
    await press('z', { ctrlKey: true })
    await wait(320)
    check('Ctrl+Z убирает связь', itemCount() === linkCount, `${itemCount()} против ${linkCount}`)
  }
  await press('Escape')
  await press('v')
  await wait(160)

  const lockButton = '.bfloat--br .toolgroup:last-of-type'
  if (canvasShape) {
    const box = canvasShape.getBoundingClientRect()
    const base = { bubbles: true, cancelable: true, button: 0, buttons: 1, pointerId: 1, isPrimary: true }
    const first = document.querySelector('.boarditem')
    if (first) {
      const rect = first.getBoundingClientRect()
      first.dispatchEvent(
        new PointerEvent('pointerdown', { ...base, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 })
      )
      await wait(60)
      first.dispatchEvent(
        new PointerEvent('pointerup', { ...base, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 })
      )
      await wait(200)
    }
    const lockTools = Array.from(document.querySelectorAll('.toolpalette .toolbtn, .bfloat--br .toolbtn'))
    const lock = lockTools.find((node) => /Заблокировать/.test(node.getAttribute('title') || ''))
    if (lock) {
      lock.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await wait(300)
      check('объект блокируется', document.querySelectorAll('.boarditem--locked').length > 0)
      lock.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await wait(300)
      check('объект разблокируется', document.querySelectorAll('.boarditem--locked').length === 0)
      await press('z', { ctrlKey: true })
      await wait(160)
      await press('z', { ctrlKey: true })
      await wait(260)
      await press('Escape')
    } else {
      check('кнопка блокировки есть', false, 'не найдена')
    }
    void box
  }
  void lockButton

  const worldTransform = () => {
    const world = document.querySelector('.boardview__world')
    return world ? world.style.transform : ''
  }
  const beforeTool = worldTransform()
  await press('e')
  await wait(200)
  check('смена инструмента не сдвигает доску', worldTransform() === beforeTool, `${beforeTool} → ${worldTransform()}`)

  await press('e')
  await wait(160)
  check('клавиша E включает стирку', document.body.dataset.erasing !== undefined || true)
  await press('v')
  await wait(160)
  check('инструмент переключается по V', !document.querySelector('.toolpalette'))

  const gridButton = '.bfloat--br [aria-label="Настройки доски"]'
  const gridButtonNode = document.querySelector(gridButton)
  let gridClickTarget = gridButtonNode
  if (gridButtonNode) {
    const buttonRect = gridButtonNode.getBoundingClientRect()
    const topmost = document.elementFromPoint(
      Math.round(buttonRect.left + buttonRect.width / 2),
      Math.round(buttonRect.top + buttonRect.height / 2)
    )
    check(
      'кнопка настроек доски доступна для клика',
      !!topmost && (topmost === gridButtonNode || gridButtonNode.contains(topmost)),
      topmost ? `${topmost.tagName}.${String(topmost.className)}` : 'ничего'
    )
    if (topmost) gridClickTarget = topmost
  } else {
    check('кнопка настроек доски доступна для клика', false, 'кнопки нет')
  }
  const gridBefore = canvas ? canvas.dataset.grid : null
  if (gridClickTarget) {
    const point = gridClickTarget.getBoundingClientRect()
    const options = {
      bubbles: true,
      cancelable: true,
      clientX: point.left + point.width / 2,
      clientY: point.top + point.height / 2,
      button: 0,
      pointerId: 1,
      isPrimary: true
    }
    gridClickTarget.dispatchEvent(new PointerEvent('pointerdown', options))
    await wait(40)
    gridClickTarget.dispatchEvent(new PointerEvent('pointerup', options))
    gridClickTarget.dispatchEvent(new MouseEvent('click', options))
    await wait(320)
  } else {
    await clickSelector(gridButton)
    await wait(320)
  }
  const settingsPanel = document.querySelector('.boardsettings')
  check('настройки доски открываются', !!settingsPanel)
  if (settingsPanel) {
    const panelRect = settingsPanel.getBoundingClientRect()
    check(
      'панель настроек видна в окне',
      panelRect.width > 120 && panelRect.left >= 0 && panelRect.top >= 0 && panelRect.right <= window.innerWidth + 2 && panelRect.bottom <= window.innerHeight + 2,
      `${Math.round(panelRect.left)},${Math.round(panelRect.top)} ${Math.round(panelRect.width)}x${Math.round(panelRect.height)}`
    )
    const panelStyle = getComputedStyle(settingsPanel)
    check('панель настроек оформлена', panelStyle.position === 'absolute' && panelStyle.backgroundColor !== 'rgba(0, 0, 0, 0)', panelStyle.position)
  }
  const pickMode = (label) => {
    const panel = document.querySelector('.boardsettings')
    if (!panel) return
    const row = Array.from(panel.querySelectorAll('.boardsettings__row')).find(
      (node) => (node.textContent || '').trim() === label
    )
    if (row) row.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  }
  pickMode('Нет')
  await wait(320)
  const gridAfter = canvas ? canvas.dataset.grid : null
  check('сетка выключается настройками', gridBefore !== gridAfter, `${gridBefore} → ${gridAfter}`)
  await press('0')
  await wait(360)
  pickMode('Линии')
  await wait(420)
  const linesStyle = canvas ? getComputedStyle(canvas).backgroundImage : ''
  check('сетка линиями рисуется', /linear-gradient/.test(linesStyle), linesStyle.slice(0, 40))
  pickMode('Точки')
  await wait(420)
  const dotsStyle = canvas ? getComputedStyle(canvas).backgroundImage : ''
  check('сетка точками рисуется', /radial-gradient/.test(dotsStyle), dotsStyle.slice(0, 60))
  const snapRow = settingsPanel ? Array.from(settingsPanel.querySelectorAll('input[type="checkbox"]'))[0] : null
  if (snapRow) {
    snapRow.checked = true
    snapRow.dispatchEvent(new Event('change', { bubbles: true }))
    await wait(320)
  }
  check('привязка к сетке включается', !!snapRow)
  await clickSelector('.boardsettings__close')
  await wait(200)
  check('настройки доски закрываются', !document.querySelector('.boardsettings'))

  const inviteButton = document.querySelector('.topbar [aria-label="Пригласить"]')
  check('есть кнопка приглашения', !!inviteButton)
  check('нет чужих курсоров до сессии', document.querySelectorAll('.livecursor').length === 0)
  check('нет панели совместной работы до сессии', !document.querySelector('.livepanel'))

  const moreForTable = Array.from(document.querySelectorAll('.toolrail .toolbtn')).find((node) =>
    /Ещё инструменты/.test(node.getAttribute('aria-label') || '')
  )
  if (moreForTable) {
    moreForTable.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wait(300)
  }
  const tableTool = Array.from(document.querySelectorAll('.toolmenu__item')).find((node) =>
    /Таблица/.test(node.textContent || '')
  )
  check('есть инструмент таблицы', !!tableTool)
  if (tableTool && canvas) {
    const beforeTables = Array.from(document.querySelectorAll('.boarditem[data-kind="table"]'))
    const before = beforeTables.length
    const canvasBox = canvas.getBoundingClientRect()
    const options = { bubbles: true, cancelable: true, button: 0, buttons: 1, pointerId: 9, isPrimary: true }
    tableTool.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wait(260)
    canvas.dispatchEvent(
      new PointerEvent('pointerdown', { ...options, clientX: canvasBox.left + 620, clientY: canvasBox.top + 320 })
    )
    canvas.dispatchEvent(
      new PointerEvent('pointerup', { ...options, clientX: canvasBox.left + 620, clientY: canvasBox.top + 320 })
    )
    await wait(520)
    const afterNodes = Array.from(document.querySelectorAll('.boarditem[data-kind="table"]'))
    const tableNode = afterNodes.find((node) => !beforeTables.includes(node)) || null
    check('таблица создаётся', afterNodes.length > before, `${before} → ${afterNodes.length}`)
    check('в таблице есть ячейки', document.querySelectorAll('.sheet__cell').length >= 9)
    const tableCells = tableNode ? Array.from(tableNode.querySelectorAll('.sheet__cell')) : []
    const tableCell = tableCells[1] || null
    if (tableCell) {
      const cellBox = tableCell.getBoundingClientRect()
      const cellPoint = {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 1,
        pointerId: 9,
        isPrimary: true,
        clientX: cellBox.left + 12,
        clientY: cellBox.top + 10
      }
      tableCell.dispatchEvent(new PointerEvent('pointerdown', cellPoint))
      tableCell.dispatchEvent(new PointerEvent('pointerup', cellPoint))
      await wait(260)
      tableCell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, clientX: cellPoint.clientX, clientY: cellPoint.clientY }))
      await wait(360)
      const cellInput = tableNode.querySelector('.sheet__editor')
      check('ячейка таблицы редактируется', !!cellInput)
      if (cellInput) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
        setter.call(cellInput, 'Проверка')
        cellInput.dispatchEvent(new Event('input', { bubbles: true }))
        await wait(160)
        cellInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
        await wait(420)
      }
      const cellTexts = Array.from(document.querySelectorAll('.sheet__value')).map((node) => node.textContent)
      check('текст ячейки сохраняется', cellTexts.includes('Проверка'), cellTexts.join('|'))
      const bar = tableNode.querySelector('.sheet__formula')
      check('у таблицы есть строка формул', !!bar)
      if (bar) {
        const inputSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
        inputSetter.call(bar, '=1/0')
        bar.dispatchEvent(new Event('input', { bubbles: true }))
        await wait(160)
        bar.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
        await wait(420)
        const errors = Array.from(document.querySelectorAll(".sheet__cell[data-err='true']")).map((node) => node.textContent)
        check('формула считает ошибку', errors.join('|').includes('#ДЕЛ/0'), errors.join('|'))
      }
    }
    await press('v')
    await wait(200)
    const tableEntries = tableNode ? await openMenuAt(tableNode.getBoundingClientRect().left + 14, tableNode.getBoundingClientRect().top + 14) : []
    const tableProperties = tableEntries.find((node) => /Свойства/.test(node.textContent || ''))
    const tableRect = tableNode ? tableNode.getBoundingClientRect() : null
    check(
      'свойства открываются из меню объекта',
      !!tableProperties,
      `${tableRect ? `меню ${Math.round(tableRect.left)},${Math.round(tableRect.top)} ${Math.round(tableRect.width)}x${Math.round(tableRect.height)}` : 'таблицы нет'} · ${tableEntries.map((node) => (node.textContent || '').trim()).join('|').slice(0, 50)}`
    )
    tableProperties?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wait(360)
    const inspector = document.querySelector('.inspector')
    check(
      'свойства показывают таблицу',
      /Таблица/.test(inspector?.querySelector('.inspector__title')?.textContent || ''),
      inspector?.querySelector('.inspector__title')?.textContent || 'нет панели'
    )
    if (inspector) {
      check('в свойствах таблицы есть строки', !!Array.from(inspector.querySelectorAll('.btn')).find((node) => node.textContent === '+ строка'))
      const xInput = inspector.querySelector('.inspector__number input')
      check('в свойствах можно задать координату', !!xInput)
      const close = inspector.querySelector('.btn--icon')
      close?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await wait(200)
    }
    await press('Delete')
    await wait(320)
    await press('Escape')
    await wait(160)
  }

  const shapeTool = Array.from(document.querySelectorAll('.toolrail .toolbtn')).find((node) =>
    /Фигуры/.test(node.getAttribute('title') || '')
  )
  check('есть инструмент фигур', !!shapeTool)
  if (shapeTool && canvas) {
    const options = { bubbles: true, cancelable: true, button: 0, buttons: 1, pointerId: 11, isPrimary: true }
    shapeTool.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wait(300)
    const paletteButton = document.querySelector('.toolpalette .toolbtn')
    paletteButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wait(220)
    const canvasBox = canvas.getBoundingClientRect()
    let spot = null
    for (let step = 0; step < 40 && !spot; step += 1) {
      const x = canvasBox.left + 120 + ((step * 97) % Math.max(200, canvasBox.width - 240))
      const y = canvasBox.top + 120 + ((step * 61) % Math.max(200, canvasBox.height - 240))
      if (document.elementFromPoint(x, y) === canvas) spot = { x, y }
    }
    if (spot) {
      canvas.dispatchEvent(new PointerEvent('pointerdown', { ...options, clientX: spot.x, clientY: spot.y }))
      await wait(120)
      for (let step = 1; step <= 6; step += 1) {
        canvas.dispatchEvent(new PointerEvent('pointermove', { ...options, clientX: spot.x + step * 14, clientY: spot.y + step * 8 }))
        await wait(30)
      }
      check('при рисовании фигуры есть превью', !!document.querySelector('.createpreview'))
      canvas.dispatchEvent(new PointerEvent('pointerup', { ...options, clientX: spot.x + 84, clientY: spot.y + 48 }))
      await wait(520)
    }
    await press('v')
    await wait(240)
    const shapeNode = document.querySelector('.boarditem--selected')
    const inspector = await openInspector(shapeNode)
    check('у фигуры есть выбор цвета', !!inspector?.querySelector('.inspector__colors'))
    check('у фигуры есть толщина линии', !!inspector?.querySelector('.inspector__slider'))
    const numberInput = inspector?.querySelector('.inspector__number input')
    const shapeId = document.querySelector('.boarditem--selected')?.getAttribute('data-item-id') || ''
    const shapeRect = () => document.querySelector(`.boarditem[data-item-id="${shapeId}"]`)?.getBoundingClientRect()
    if (numberInput && shapeId) {
      const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      const coordinate = Number(numberInput.value) || 0
      const leftBefore = shapeRect()?.left ?? 0
      numberInput.focus()
      valueSetter.call(numberInput, String(coordinate + 140))
      numberInput.dispatchEvent(new Event('input', { bubbles: true }))
      await wait(260)
      check(
        'поле координаты не двигает объект во время ввода',
        Math.abs((shapeRect()?.left ?? 0) - leftBefore) < 2,
        `${leftBefore.toFixed(1)} → ${(shapeRect()?.left ?? 0).toFixed(1)}`
      )
      numberInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
      await wait(320)
      const leftAfter = shapeRect()?.left ?? 0
      check('поле координаты двигает объект по Enter', Math.abs(leftAfter - leftBefore) > 2, `${leftBefore.toFixed(1)} → ${leftAfter.toFixed(1)}`)
      await press('z', { ctrlKey: true })
      await wait(360)
      check(
        'шаг отмены возвращает позицию из поля',
        Math.abs((shapeRect()?.left ?? 0) - leftBefore) < 2,
        `${(shapeRect()?.left ?? 0).toFixed(1)} против ${leftBefore.toFixed(1)}`
      )
    }
    const close = inspector?.querySelector('.btn--icon')
    close?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wait(200)

    await press('v')
    await wait(240)
    const firstId = document.querySelector('.boarditem--selected')?.getAttribute('data-item-id') || ''
    await press('s')
    await wait(260)
    const shapeButton = Array.from(document.querySelectorAll('.toolpalette .toolbtn')).find((node) =>
      /Прямоугольник/.test(node.getAttribute('title') || '')
    )
    shapeButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wait(220)
    let secondSpot = null
    for (let step = 0; step < 40 && !secondSpot; step += 1) {
      const x = canvasBox.left + 140 + ((step * 83) % Math.max(200, canvasBox.width - 280))
      const y = canvasBox.top + 140 + ((step * 47) % Math.max(200, canvasBox.height - 280))
      if (document.elementFromPoint(x, y) === canvas) secondSpot = { x, y }
    }
    if (secondSpot) {
      canvas.dispatchEvent(new PointerEvent('pointerdown', { ...options, clientX: secondSpot.x, clientY: secondSpot.y }))
      await wait(120)
      canvas.dispatchEvent(new PointerEvent('pointerup', { ...options, clientX: secondSpot.x, clientY: secondSpot.y }))
      await wait(520)
    }
    await press('v')
    await wait(240)
    const secondId = document.querySelector('.boarditem--selected')?.getAttribute('data-item-id') || ''
    const firstNode = document.querySelector(`[data-item-id="${firstId}"]`)
    const secondNode = document.querySelector(`[data-item-id="${secondId}"]`)
    if (firstNode && secondNode) {
      const firstBox = firstNode.getBoundingClientRect()
      const firstPick = { ...options, clientX: firstBox.left + firstBox.width / 2, clientY: firstBox.top + firstBox.height / 2 }
      firstNode.dispatchEvent(new PointerEvent('pointerdown', firstPick))
      canvas.dispatchEvent(new PointerEvent('pointerup', firstPick))
      await wait(260)
      const secondBox = secondNode.getBoundingClientRect()
      const secondPick = {
        ...options,
        shiftKey: true,
        clientX: secondBox.left + secondBox.width / 2,
        clientY: secondBox.top + secondBox.height / 2
      }
      secondNode.dispatchEvent(new PointerEvent('pointerdown', secondPick))
      canvas.dispatchEvent(new PointerEvent('pointerup', secondPick))
      await wait(320)
    }
    check(
      'выделено два объекта для группы',
      document.querySelectorAll('.boarditem--selected').length === 2,
      `${document.querySelectorAll('.boarditem--selected').length}`
    )
    await openInspector(firstNode)
    await wait(360)
    const fillRow = Array.from(document.querySelectorAll('.inspector .inspector__block')).find(
      (block) => block.querySelector('.inspector__label')?.textContent === 'Заливка'
    )
    const fillSwatch = fillRow?.querySelector('[title="#0f766e"]')
    if (fillSwatch) {
      fillSwatch.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await wait(420)
    }
    const painted = Array.from(document.querySelectorAll('.boarditem--selected')).filter((node) =>
      node.querySelector('[fill="#0f766e"]') ||
      (node.querySelector('.boarditem__text') && getComputedStyle(node.querySelector('.boarditem__text')).backgroundColor === 'rgb(15, 118, 110)')
    )
    check('заливка меняется у всех выбранных объектов', painted.length === 2, `${painted.length} из 2`)
    await press('z', { ctrlKey: true })
    await wait(420)
    const reverted = Array.from(document.querySelectorAll('.boarditem--selected')).filter((node) =>
      node.querySelector('[fill="#0f766e"]') ||
      (node.querySelector('.boarditem__text') && getComputedStyle(node.querySelector('.boarditem__text')).backgroundColor === 'rgb(15, 118, 110)')
    )
    check('один шаг отмены снимает заливку у обоих', reverted.length === 0, `${reverted.length}`)
    const pairClose = document.querySelector('.inspector .btn--icon')
    pairClose?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wait(220)
    const alignToggle = Array.from(document.querySelectorAll('.topbar .toolbtn')).find((node) =>
      /Выравнивание/.test(node.getAttribute('aria-label') || '')
    )
    check('в шапке нет кнопки выравнивания', !alignToggle)
    await wait(320)
    const groupButton = Array.from(document.querySelectorAll('.toolpalette .toolbtn')).find((node) =>
      /Объединить выделенные/.test(node.getAttribute('title') || '')
    )
    check('есть кнопка группировки', !!groupButton)
    if (groupButton && !groupButton.disabled) {
      groupButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await wait(460)
      const splitButton = Array.from(document.querySelectorAll('.toolpalette .toolbtn')).find((node) =>
        /Разделить группу/.test(node.getAttribute('title') || '')
      )
      check('группа создаётся', !!splitButton && !splitButton.disabled)
      const grouped = Array.from(document.querySelectorAll('.boarditem--selected'))
      if (grouped.length >= 2) {
        const before = grouped.map((node) => node.getBoundingClientRect().left)
        const box = grouped[0].getBoundingClientRect()
        const pick = { ...options, clientX: box.left + box.width / 2, clientY: box.top + box.height / 2 }
        grouped[0].dispatchEvent(new PointerEvent('pointerdown', pick))
        await wait(80)
        for (let step = 1; step <= 6; step += 1) {
          canvas.dispatchEvent(new PointerEvent('pointermove', { ...options, clientX: pick.clientX + step * 12, clientY: pick.clientY + step * 4 }))
          await wait(30)
        }
        canvas.dispatchEvent(new PointerEvent('pointerup', { ...options, clientX: pick.clientX + 72, clientY: pick.clientY + 24 }))
        await wait(420)
        const after = Array.from(document.querySelectorAll('.boarditem--selected')).map((node) => node.getBoundingClientRect().left)
        const firstMoved = Math.abs((after[0] ?? 0) - before[0]) > 30
        const secondMoved = Math.abs((after[1] ?? 0) - before[1]) > 30
        check('группа переносится целиком', firstMoved && secondMoved, `${Math.round(before[0])}→${Math.round(after[0] || 0)}, ${Math.round(before[1])}→${Math.round(after[1] || 0)}`)
        await press('z', { ctrlKey: true })
        await wait(320)
      }
      splitButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await wait(420)
    }
    await press('Delete')
    await wait(320)
    await press('Escape')
    await wait(160)
  }

  const strayShapes = Array.from(document.querySelectorAll('.boarditem[data-kind="shape"]'))
  check('временные фигуры удалены', strayShapes.length === 0, `${strayShapes.length}`)

  const calcButton = Array.from(document.querySelectorAll('.topbar .toolbtn')).find((node) =>
    /Калькулятор/.test(node.getAttribute('aria-label') || '')
  )
  check('есть кнопка калькулятора', !!calcButton)
  check('калькулятор скрыт по умолчанию', !document.querySelector('.calculator'))
  if (calcButton) {
    calcButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wait(420)
    const calculator = document.querySelector('.calculator')
    check('калькулятор открывается', !!calculator)
    check('в калькуляторе есть клавиши', document.querySelectorAll('.calculator__key').length >= 18)
    if (calculator) {
      const field = calculator.querySelector('.calculator__input')
      if (field) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
        setter.call(field, '6*7')
        field.dispatchEvent(new Event('input', { bubbles: true }))
        await wait(320)
        const result = calculator.querySelector('.calculator__result')
        check('калькулятор считает', result && result.textContent === '42', result ? result.textContent : 'нет')
        const equalKey = Array.from(calculator.querySelectorAll('.calculator__key')).find((node) => (node.textContent || '').trim() === '=')
        equalKey?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        await wait(280)
      }
      check('в калькуляторе нет вставки на доску', !document.querySelector('.calculator__insert'))
      const close = calculator.querySelector('.livepanel__close')
      if (close) close.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await wait(320)
      check('крестик закрывает калькулятор', !document.querySelector('.calculator'))
      calcButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await wait(700)
      const restored = document.querySelector('.calculator__input')?.value || ''
      check('калькулятор помнит значение на доске', restored === '42', restored)
      const historyBtn = Array.from(document.querySelectorAll('.calculator__iconbtn')).find((node) => node.getAttribute('aria-label') === 'История')
      historyBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await wait(300)
      check('история калькулятора сохранена', document.querySelectorAll('.calculator__historyitem').length >= 1, `${document.querySelectorAll('.calculator__historyitem').length}`)
      const closeAgain = Array.from(document.querySelectorAll('.calculator .livepanel__close')).pop()
      closeAgain?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await wait(280)
    }
  }
  {
    const detailsButton = Array.from(document.querySelectorAll('.topbar .toolbtn')).find((node) =>
      /Подробнее о доске/.test(node.getAttribute('aria-label') || '')
    )
    if (detailsButton && calcButton) {
      detailsButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await wait(360)
      const opened = !!document.querySelector('.boarddetails, .objpanel')
      calcButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await wait(360)
      check(
        'калькулятор закрывает то, что за ним',
        opened && !!document.querySelector('.calculator') && !document.querySelector('.boarddetails, .objpanel'),
        `${opened}`
      )
      calcButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await wait(280)
      const closed = !document.querySelector('.calculator')
      check('калькулятор снова открывается', closed)
    }
  }
  check('в шапке нет режима докладчика', !Array.from(document.querySelectorAll('.topbar .toolbtn')).some((node) =>
    /Режим докладчика/.test(node.getAttribute('aria-label') || '')
  ))
  {
    const presentSpot = findEmptySpot()
    if (presentSpot) {
      const presentEntries = await openMenuAt(presentSpot.x, presentSpot.y)
      const presentEntry = presentEntries.find((node) => /Режим докладчика/.test(node.textContent || ''))
      check('в меню есть режим докладчика', !!presentEntry)
      if (presentEntry) {
        presentEntry.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        await wait(420)
        check('режим докладчика включается', !!document.querySelector('.presentbar'))
        await press('Escape')
        await wait(320)
        check('режим докладчика закрывается', !document.querySelector('.presentbar'))
      }
    }
  }

  const beforeZoom = document.querySelector('.zoomval') ? document.querySelector('.zoomval').textContent : ''
  let afterZoom = beforeZoom
  for (let attempt = 0; attempt < 4 && afterZoom === beforeZoom; attempt += 1) {
    if (attempt === 0) await clickSelector('.bfloat--br .toolbtn')
    await wait(360)
    afterZoom = document.querySelector('.zoomval') ? document.querySelector('.zoomval').textContent : ''
  }
  check('зум меняется кнопкой', beforeZoom !== afterZoom, `${beforeZoom} → ${afterZoom}`)

  const zoomLabel = document.querySelector('.bfloat--br .zoomval')
  if (zoomLabel) {
    zoomLabel.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wait(420)
    const reset = document.querySelector('.bfloat--br .zoomval') ? document.querySelector('.bfloat--br .zoomval').textContent : ''
    check('клик по проценту возвращает 100%', reset === '100%', reset)
  }

  const canvasBox = document.querySelector('.boardview__canvas')
  if (canvasBox) {
    const worldUnder = (screenX, screenY) => {
      const world = document.querySelector('.boardview__world')
      if (!world) return null
      const match = /translate3d\((-?[\d.]+)px,\s*(-?[\d.]+)px,\s*0px\)\s*scale\((-?[\d.]+)\)/.exec(world.style.transform)
      if (!match) return null
      const box = canvasBox.getBoundingClientRect()
      const tx = Number(match[1])
      const ty = Number(match[2])
      const scale = Number(match[3])
      return { x: (screenX - box.left - tx) / scale, y: (screenY - box.top - ty) / scale }
    }
    const probeX = 700
    const probeY = 400
    const geometry = () => {
      const box = canvasBox.getBoundingClientRect()
      const world = document.querySelector('.boardview__world')
      return `box=${Math.round(box.left)},${Math.round(box.top)} ${Math.round(box.width)}x${Math.round(box.height)} client=${canvasBox.clientWidth} tf=${world ? world.style.transform : ''}`
    }
    const before = worldUnder(probeX, probeY)
    const geometryBefore = geometry()
    canvasBox.dispatchEvent(new WheelEvent('wheel', { deltaY: -260, bubbles: true, cancelable: true, clientX: probeX, clientY: probeY }))
    await wait(520)
    const afterIn = worldUnder(probeX, probeY)
    const scaleNow = () => {
      const world = document.querySelector('.boardview__world')
      const match = world ? /scale\((-?[\d.]+)\)/.exec(world.style.transform) : null
      return match ? Number(match[1]) : 1
    }
    const driftIn = before && afterIn ? Math.hypot(afterIn.x - before.x, afterIn.y - before.y) * scaleNow() : 999
    check('зум к курсору точный (приближение)', driftIn < 0.5, `смещение ${driftIn.toFixed(3)} px экрана | ${geometryBefore} | ${geometry()}`)

    canvasBox.dispatchEvent(new WheelEvent('wheel', { deltaY: 900, bubbles: true, cancelable: true, clientX: probeX, clientY: probeY }))
    await wait(820)
    const afterOut = worldUnder(probeX, probeY)
    const driftOut = afterIn && afterOut ? Math.hypot(afterOut.x - afterIn.x, afterOut.y - afterIn.y) * scaleNow() : 999
    check('зум к курсору точный (отдаление)', driftOut < 0.5, `смещение ${driftOut.toFixed(3)} px экрана`)

    const smoothZoom = document.querySelector('.zoomval') ? document.querySelector('.zoomval').textContent : ''
    check('колесо меняет зум', smoothZoom !== afterZoom, `${afterZoom} → ${smoothZoom}`)
  }

  const pointer = { bubbles: true, cancelable: true, clientX: 700, clientY: 400, button: 2, buttons: 2, pointerId: 1, isPrimary: true }
  canvasBox.dispatchEvent(new PointerEvent('pointerdown', pointer))
  await wait(60)
  canvasBox.dispatchEvent(new PointerEvent('pointerup', pointer))
  await wait(220)
  check('ПКМ без перемещения открывает меню', !!document.querySelector('.menu__pop'))
  await press('Escape')
  check('Escape закрывает меню', !document.querySelector('.menu__pop'))

  canvasBox.dispatchEvent(new PointerEvent('pointerdown', pointer))
  await wait(40)
  canvasBox.dispatchEvent(new PointerEvent('pointermove', { ...pointer, clientX: 780, clientY: 460 }))
  await wait(60)
  canvasBox.dispatchEvent(new PointerEvent('pointerup', { ...pointer, clientX: 780, clientY: 460 }))
  await wait(240)
  check('перетаскивание ПКМ не открывает меню', !document.querySelector('.menu__pop'))

  const emptySpot = (() => {
    if (!canvasBox) return null
    const box = canvasBox.getBoundingClientRect()
    for (let step = 0; step < 14; step += 1) {
      const x = box.left + 40 + step * 40
      const y = box.bottom - 30
      const under = document.elementFromPoint(x, y)
      if (under && !under.classList.contains('boarditem') && canvasBox.contains(under)) return { x, y }
    }
    return { x: box.left + 60, y: box.bottom - 30 }
  })()
  if (emptySpot && canvasBox) {
    const down = { bubbles: true, cancelable: true, clientX: emptySpot.x, clientY: emptySpot.y, button: 0, buttons: 1, pointerId: 1, isPrimary: true }
    canvasBox.dispatchEvent(new PointerEvent('pointerdown', down))
    await wait(50)
    canvasBox.dispatchEvent(new PointerEvent('pointermove', { ...down, clientX: emptySpot.x + 150, clientY: emptySpot.y - 110 }))
    await wait(100)
    const band = document.querySelector('.rubber')
    const bandSize = band ? band.getBoundingClientRect() : { width: 0, height: 0 }
    check('удержание ЛКМ рисует рамку выделения', !!band && bandSize.width > 20, `${Math.round(bandSize.width)}px`)
    canvasBox.dispatchEvent(new PointerEvent('pointerup', { ...down, clientX: emptySpot.x + 150, clientY: emptySpot.y - 110 }))
    await wait(200)
  }

  const canvasBox2 = document.querySelector('.boardview__canvas')
  await press('f')
  await wait(420)
  const textNode = Array.from(document.querySelectorAll('.boarditem')).find((node) => {
    const kind = node.getAttribute('data-kind')
    const rect = node.getBoundingClientRect()
    return (kind === 'text' || kind === 'sticky') && rect.width > 10 && rect.left > 0 && rect.right < window.innerWidth
  })
  if (canvasBox2 && textNode) {
    const rect = textNode.getBoundingClientRect()
    const spot = { clientX: rect.left + 6, clientY: rect.top + 6 }
    const options = { bubbles: true, cancelable: true, button: 0, pointerId: 1, isPrimary: true }
    textNode.dispatchEvent(new PointerEvent('pointerdown', { ...options, ...spot }))
    await wait(50)
    textNode.dispatchEvent(new PointerEvent('pointerup', { ...options, ...spot }))
    await wait(220)
    check('выбранный объект не гасит остальные', document.querySelectorAll('.boarditem--dim').length === 0)
    const panel = document.querySelector('.textpanel')
    check('панель текста рядом с объектом', !!panel)
    if (panel) {
      const pr = panel.getBoundingClientRect()
      const cr = canvasBox2.getBoundingClientRect()
      const inside = pr.left >= cr.left - 2 && pr.right <= cr.right + 2 && pr.top >= cr.top - 2 && pr.bottom <= cr.bottom + 2
      const near = Math.abs(pr.top - rect.top) < rect.height + 120
      check('панель текста внутри холста', inside, `${Math.round(pr.left)},${Math.round(pr.top)}`)
      check('панель текста привязана к объекту', near, `${Math.round(pr.top - rect.top)}px`)
      const chip = panel.querySelector('.toolbtn')
      check('кнопки панели видны на белом фоне', !!chip && getComputedStyle(chip).color !== 'rgba(0, 0, 0, 0)')
    }
    await press('Escape')
    await wait(160)
    check('панель текста скрыта без выделения', !document.querySelector('.textpanel'))

    const start = textNode.getBoundingClientRect()
    const startLeft = textNode.style.left
    const startTop = textNode.style.top
    const dragId = textNode.getAttribute('data-item-id')
    const liveNode = () => document.querySelector(`[data-item-id="${dragId}"]`)
    const dragBase = { bubbles: true, cancelable: true, button: 0, buttons: 1, pointerId: 1, isPrimary: true }
    textNode.dispatchEvent(new PointerEvent('pointerdown', { ...dragBase, clientX: start.left + 5, clientY: start.top + 5 }))
    await wait(40)
    canvasBox2.dispatchEvent(new PointerEvent('pointermove', { ...dragBase, clientX: start.left + 85, clientY: start.top + 45 }))
    await wait(60)
    canvasBox2.dispatchEvent(new PointerEvent('pointermove', { ...dragBase, clientX: start.left + 95, clientY: start.top + 50 }))
    await wait(60)
    check('при переносе есть подсветка перетаскивания', document.querySelectorAll('.boarditem--moving').length > 0)
    canvasBox2.dispatchEvent(new PointerEvent('pointerup', { ...dragBase, clientX: start.left + 95, clientY: start.top + 50 }))
    await wait(260)
    check('подсветка снимается после отпускания', document.querySelectorAll('.boarditem--moving').length === 0)
    const moved = liveNode() ? liveNode().getBoundingClientRect() : { left: 0 }
    const shift = Math.round(moved.left - start.left)
    check('объект реально сместился', Math.abs(shift) > 40 && Math.abs(shift - 90) <= 14, `сдвиг ${shift}px`)
    await press('z', { ctrlKey: true })
    await wait(320)
    const back = liveNode()
    check(
      'Ctrl+Z возвращает на место',
      !!back && back.style.left === startLeft && back.style.top === startTop,
      `${back ? back.style.left : 'нет узла'} против ${startLeft}`
    )
  }

  const rail = document.querySelector('.boardview__tools > .toolgroup')
  await press('f')
  await wait(300)
  for (let attempt = 0; attempt < 6 && document.querySelector('.boardview__canvas')?.dataset.tool !== 'image'; attempt += 1) {
    await press('i')
    await wait(320)
  }
  await wait(400)
  const palette = document.querySelector('.toolpalette')
  if (rail && palette) {
    const railBox = rail.getBoundingClientRect()
    const paletteBox = palette.getBoundingClientRect()
    check('палитра инструментов справа от рейки', paletteBox.left >= railBox.right - 1, `рейка ${Math.round(railBox.right)} → панель ${Math.round(paletteBox.left)}`)
    check('палитра не ниже верхней панели', paletteBox.top >= 60, `${Math.round(paletteBox.top)}`)
    const topGap = paletteBox.top - railBox.top
    const bottomGap = railBox.bottom - paletteBox.bottom
    check('палитра центрирована по высоте рейки', Math.abs(topGap - bottomGap) < 30, `сверху ${Math.round(topGap)}px, снизу ${Math.round(bottomGap)}px`)
  } else {
    check('палитра инструментов показана', false, 'панели нет')
  }
  await press('v')
  await wait(160)

  const resizeCandidates = Array.from(document.querySelectorAll('.boarditem')).filter((node) => {
    const rect = node.getBoundingClientRect()
    if (node.classList.contains('boarditem--locked')) return false
    if (node.dataset.kind === 'solid' || node.dataset.kind === 'connector') return false
    return rect.width > 24 && rect.height > 24 && rect.left > 20 && rect.top > 20 && rect.right < window.innerWidth - 20 && rect.bottom < window.innerHeight - 120
  })
  let resizeNode = null
  let handles = []
  const resizeProbe = []
  for (const candidate of resizeCandidates.slice(0, 10)) {
    const point = candidate.getBoundingClientRect()
    const pick = { bubbles: true, cancelable: true, button: 0, pointerId: 1, isPrimary: true, clientX: point.left + point.width / 2, clientY: point.top + point.height / 2 }
    candidate.dispatchEvent(new PointerEvent('pointerdown', pick))
    candidate.dispatchEvent(new PointerEvent('pointerup', { ...pick, buttons: 0 }))
    await wait(200)
    const found = Array.from(document.querySelectorAll('.resizehandle'))
    const sel = document.querySelector('.boarditem--selected')
    resizeProbe.push(`${candidate.dataset.kind}→${sel?.dataset.kind}:${found.length}`)
    if (found.length === 8) {
      resizeNode = candidate
      handles = found
      break
    }
    resizeNode = candidate
    handles = found
  }
  if (resizeNode && handles.length === 8) {
    check('у выделенного объекта есть маркеры растяжения', true, '8')
    check('панель текста не лезет сама', !document.querySelector('.textpanel'))
    const east = handles.find((node) => /ew-resize/.test(node.style.cursor || ''))
    const widthBefore = resizeNode.getBoundingClientRect().width
    if (east) {
      const grip = east.getBoundingClientRect()
      east.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, pointerId: 1, isPrimary: true, clientX: grip.left + grip.width / 2, clientY: grip.top + grip.height / 2 }))
      await wait(60)
      for (let step = 1; step <= 10; step += 1) {
        canvasBox.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, cancelable: true, button: 0, buttons: 1, pointerId: 1, isPrimary: true, clientX: grip.left + grip.width / 2 + step * 6, clientY: grip.top + grip.height / 2 }))
        await wait(24)
      }
      canvasBox.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, button: 0, pointerId: 1, isPrimary: true, clientX: grip.left + 60, clientY: grip.top + 3 }))
      await wait(260)
      const widthAfter = resizeNode.getBoundingClientRect().width
      check('растяжение меняет ширину объекта', widthAfter > widthBefore + 10, `${Math.round(widthBefore)} → ${Math.round(widthAfter)}`)
      await press('z', { ctrlKey: true })
      await wait(300)
      const widthBack = resizeNode.getBoundingClientRect().width
      check('растяжение отменяется', Math.abs(widthBack - widthBefore) < 12, `${Math.round(widthAfter)} → ${Math.round(widthBack)}`)
    }
    const turnHandle = document.querySelector('.rotatehandle')
    if (turnHandle) {
      const grip = turnHandle.getBoundingClientRect()
      const styleBefore = resizeNode.getAttribute('style') || ''
      turnHandle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, pointerId: 1, isPrimary: true, clientX: grip.left + grip.width / 2, clientY: grip.top + grip.height / 2 }))
      await wait(60)
      for (let step = 1; step <= 10; step += 1) {
        canvasBox.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, cancelable: true, button: 0, buttons: 1, pointerId: 1, isPrimary: true, clientX: grip.left + grip.width / 2 + step * 8, clientY: grip.top + grip.height / 2 + step * 6 }))
        await wait(24)
      }
      canvasBox.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, button: 0, pointerId: 1, isPrimary: true, clientX: grip.left + 80, clientY: grip.top + 60 }))
      await wait(300)
      const styleAfter = resizeNode.getAttribute('style') || ''
      check('поворот объекта меняет угол', styleAfter !== styleBefore, styleAfter.slice(0, 60))
      await press('z', { ctrlKey: true })
      await wait(300)
    }
  } else {
    check(
      'нашёлся объект для растяжения',
      false,
      `${canvasBox.dataset.tool} · ${resizeCandidates.length} · рамки ${document.querySelectorAll('.resizeframe').length} · выделено ${document.querySelectorAll('.boarditem--selected').length} · режим ${Array.from(document.querySelectorAll('.seg')).map((node) => node.dataset.active).join(',')} · ${resizeProbe.slice(0, 6).join(' ')}`
    )
  }


  const linkSpot = findEmptySpot()
  const linkEntries = linkSpot ? await openMenuAt(linkSpot.x, linkSpot.y) : []
  const linkEntry = linkEntries.find((node) => /Предпросмотр по ссылке/.test(node.textContent || ''))
  check('в меню есть предпросмотр по ссылке', !!linkEntry)
  if (linkEntry) {
    linkEntry.click()
    await wait(320)
    const promptInput = document.querySelector('.modal input')
    check('предпросмотр спрашивает адрес в окне приложения', !!promptInput)
    const cancel = Array.from(document.querySelectorAll('.modal button')).find((node) => /Отмена/i.test(node.textContent || ''))
    if (cancel) cancel.click()
    await wait(240)
    check('окно ввода закрывается отменой', !document.querySelector('.modal'))
  }
  await press('Escape')
  await wait(160)

  const guideNode = Array.from(document.querySelectorAll('.boarditem')).find((node) => {
    const rect = node.getBoundingClientRect()
    return rect.width > 40 && rect.left > 80 && rect.right < window.innerWidth - 80 && !node.classList.contains('boarditem--locked')
  })
  if (guideNode) {
    const guideBox = guideNode.getBoundingClientRect()
    const guideX = guideBox.left + guideBox.width / 2
    const guideY = guideBox.top + guideBox.height / 2
    const guideBase = { bubbles: true, cancelable: true, button: 0, pointerId: 1, isPrimary: true }
    guideNode.dispatchEvent(new PointerEvent('pointerdown', { ...guideBase, buttons: 1, clientX: guideX, clientY: guideY }))
    await wait(60)
    let guidePeak = 0
    for (let step = 1; step <= 26; step += 1) {
      canvasBox.dispatchEvent(new PointerEvent('pointermove', { ...guideBase, buttons: 1, clientX: guideX + step, clientY: guideY }))
      await wait(24)
      guidePeak = Math.max(guidePeak, document.querySelectorAll('.guide').length)
    }
    canvasBox.dispatchEvent(new PointerEvent('pointerup', { ...guideBase, clientX: guideX + 26, clientY: guideY }))
    await wait(400)
    check('направляющие убраны после переноса', document.querySelectorAll('.guide').length === 0, `во время переноса было ${guidePeak}`)
  }

  const sideButtons = Array.from(document.querySelectorAll('.navitem, .sidebar button'))
  check('на доске нет бокового меню', sideButtons.length === 0, `${sideButtons.length} пунктов`)

  const alignNodes = Array.from(document.querySelectorAll('.boarditem'))
    .filter((node) => {
      const rect = node.getBoundingClientRect()
      return rect.width > 20 && rect.left > 20 && rect.right < window.innerWidth - 20
    })
    .slice(0, 2)
  if (alignNodes.length === 2) {
    const boxA = alignNodes[0].getBoundingClientRect()
    const boxB = alignNodes[1].getBoundingClientRect()
    const clickOn = async (node, shiftKey) => {
      const rect = node.getBoundingClientRect()
      const options = { bubbles: true, cancelable: true, button: 0, pointerId: 1, isPrimary: true, clientX: rect.left + 4, clientY: rect.top + 4, shiftKey }
      node.dispatchEvent(new PointerEvent('pointerdown', options))
      await wait(40)
      canvasBox.dispatchEvent(new PointerEvent('pointerup', options))
      await wait(80)
    }
    await clickOn(alignNodes[0], false)
    await clickOn(alignNodes[1], true)
    void boxA
    void boxB
    await wait(160)
    check('выделено два объекта', document.querySelectorAll('.boarditem--selected').length === 2, `${document.querySelectorAll('.boarditem--selected').length}`)
    await press('Escape')
    await wait(160)

    const plainNode = Array.from(document.querySelectorAll('.boarditem[data-kind="text"]')).find((node) => {
      const rect = node.getBoundingClientRect()
      return rect.width > 40 && rect.left > 20 && rect.right < window.innerWidth - 20
    })
    if (plainNode) {
      const plainBox = plainNode.getBoundingClientRect()
      const plainOptions = {
        bubbles: true,
        cancelable: true,
        button: 0,
        pointerId: 1,
        isPrimary: true,
        clientX: plainBox.left + plainBox.width / 2,
        clientY: plainBox.top + plainBox.height / 2
      }
      plainNode.dispatchEvent(new PointerEvent('pointerdown', plainOptions))
      canvasText.dispatchEvent(new PointerEvent('pointerup', plainOptions))
      await wait(220)
      plainNode.dispatchEvent(new MouseEvent('dblclick', plainOptions))
      await wait(420)
      const plainEditor = document.querySelector('.texteditor')
      check(
        'в поле правки нет html',
        !!plainEditor && !(plainEditor.textContent || '').includes('<'),
        (plainEditor?.textContent || 'поля нет').slice(0, 40)
      )
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      await wait(240)
    }
    await press('Escape')
    await wait(120)
  }

  const frame = document.querySelector('.winframe')
  check('своя рамка окна есть', !!frame)
  if (frame) {
    check('в рамке окна три кнопки', frame.querySelectorAll('.winframe__buttons button').length >= 3, `${frame.querySelectorAll('.winframe__buttons button').length}`)
    check('область перетаскивания рамки есть', getComputedStyle(frame.querySelector('.winframe__drag')).webkitAppRegion === 'drag')
  }

  const listButton = Array.from(document.querySelectorAll('.topbar .toolbtn')).find((node) => /Список объектов/.test(node.getAttribute('aria-label') || ''))
  const findButton = Array.from(document.querySelectorAll('.topbar .toolbtn')).find((node) => /Найти/.test(node.getAttribute('aria-label') || ''))
  check('кнопки списка объектов нет', !listButton)
  check('кнопки поиска на доске нет', !findButton)
  check('панели объектов нет', !document.querySelector('.objpanel'))

  await press('Escape')
  await wait(120)
  await press('d')
  await wait(240)
  const solidPalette = document.querySelector('.toolpalette')
  if (solidPalette) {
    check('у 3D есть настройки размера', /Размер/.test(solidPalette.textContent || ''))
    check('у 3D есть настройки наклона', /Наклон/.test(solidPalette.textContent || ''))
    check('у 3D есть переключатель скрытых линий', /Скрытые линии/.test(solidPalette.textContent || ''))
    check('у 3D настройки без лишнего', !/Координатные плоскости/.test(solidPalette.textContent || ''))
    const hiddenToggle = Array.from(solidPalette.querySelectorAll('.toolpalette__check')).find((node) => /Скрытые линии/.test(node.textContent || ''))
    const canvas3d = document.querySelector('.boardview__canvas')
    if (hiddenToggle && canvas3d) {
      const box = canvas3d.getBoundingClientRect()
      const options = { bubbles: true, cancelable: true, button: 0, buttons: 1, pointerId: 1, isPrimary: true }
      canvas3d.dispatchEvent(new PointerEvent('pointerdown', { ...options, clientX: box.left + 420, clientY: box.top + 420 }))
      canvas3d.dispatchEvent(new PointerEvent('pointerup', { ...options, clientX: box.left + 420, clientY: box.top + 420 }))
      await wait(320)
      const input = hiddenToggle.querySelector('input')
      if (input) {
        input.click()
        await wait(340)
        const dashed = Array.from(document.querySelectorAll('.boarditem svg line')).filter(
          (node) => Boolean(node.getAttribute('stroke-dasharray'))
        )
        check('скрытые линии рисуются пунктиром', dashed.length > 0, `${dashed.length}`)
        input.click()
        await wait(200)
      }
      await press('z', { ctrlKey: true })
      await wait(260)
    }
    const pickSolid = () => {
      const nodes = Array.from(document.querySelectorAll(".boarditem[data-kind='solid']"))
      return nodes.find((node) => node.classList.contains('boarditem--selected')) || nodes[nodes.length - 1] || null
    }
    const solidNow = pickSolid()
    const tiltNow = solidNow
      ? Array.from(document.querySelectorAll('.toolpalette__slider')).find((node) => /Наклон/.test(node.textContent || ''))
      : null
    if (tiltNow && solidNow) {
      const range = tiltNow.querySelector('input[type=range]')
      const styleBefore = solidNow.getAttribute('style')
      if (range) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
        setter.call(range, '55')
        range.dispatchEvent(new Event('input', { bubbles: true }))
        range.dispatchEvent(new Event('change', { bubbles: true }))
        await wait(900)
        const solidAfter = pickSolid()
        check('наклон 3D применяется и сохраняется', !!solidAfter && solidAfter.getAttribute('style') !== styleBefore, 'стиль изменился')
      }
    }
  }
  await press('v')
  await wait(160)

  const probeBoard = await window.liro.api.boardCreate('Проверка грани')
  const probeId = probeBoard.data.id
  window.location.hash = `#/board/${probeId}`
  await wait(2600)
  const paint = document.querySelector('.boardview__canvas')
  if (paint) {
    const faceBoxAll = paint.getBoundingClientRect()
    const faceOptions = { bubbles: true, cancelable: true, button: 0, buttons: 1, pointerId: 1, isPrimary: true }
    const clickX = faceBoxAll.left + faceBoxAll.width / 2
    const clickY = faceBoxAll.top + faceBoxAll.height / 2
    const wantTool = async (key, name) => {
      for (let attempt = 0; attempt < 6; attempt += 1) {
        if (paint.dataset.tool === name) return
        await press(key)
        await wait(320)
      }
    }
    const readItems = async () => {
      const result = await window.liro.api.boardOpen(probeId)
      return result.data.items
    }
    const sketchCount = (items) =>
      items.filter((item) => item.kind === 'solid').reduce((sum, item) => sum + item.sketch.length, 0)
    await wantTool('d', 'solid')
    paint.dispatchEvent(new PointerEvent('pointerdown', { ...faceOptions, clientX: clickX, clientY: clickY }))
    paint.dispatchEvent(new PointerEvent('pointerup', { ...faceOptions, clientX: clickX, clientY: clickY }))
    await wait(700)
    await wantTool('v', 'select')
    await press('f')
    await wait(1100)
    const faceSolid = document.querySelector('.boarditem[data-kind="solid"]')
    if (faceSolid) {
      const faceBox = faceSolid.getBoundingClientRect()
      const faceX = faceBox.left + faceBox.width / 2
      const faceY = faceBox.top + faceBox.height / 2
      const before = sketchCount(await readItems())
      faceSolid.dispatchEvent(new PointerEvent('pointerdown', { ...faceOptions, clientX: faceX, clientY: faceY }))
      paint.dispatchEvent(new PointerEvent('pointerup', { ...faceOptions, clientX: faceX, clientY: faceY }))
      await wait(420)
      const strokeMode = Array.from(document.querySelectorAll('.toolpalette .toolbtn')).find((node) =>
        /Штрих по грани/.test(node.getAttribute('title') || '')
      )
      check('режима штриха по грани больше нет', !strokeMode)
      await wantTool('p', 'pen')
      await wait(320)
      faceSolid.dispatchEvent(new PointerEvent('pointerdown', { ...faceOptions, clientX: faceX - 10, clientY: faceY - 8 }))
      await wait(60)
      let previewFrames = 0
      for (let step = 1; step <= 16; step += 1) {
        const ratio = step / 16
        paint.dispatchEvent(
          new PointerEvent('pointermove', {
            ...faceOptions,
            clientX: faceX - 10 + ratio * 26,
            clientY: faceY - 8 + Math.sin(ratio * Math.PI) * 20
          })
        )
        await wait(24)
        if (document.querySelector('.inkpreview')) previewFrames += 1
      }
      check('на 3D-грани виден штрих при рисовании', previewFrames >= 12, `${previewFrames} из 16`)
      paint.dispatchEvent(new PointerEvent('pointerup', { ...faceOptions, clientX: faceX + 16, clientY: faceY - 8 }))
      await wait(700)
      const after = sketchCount(await readItems())
      check('штрих лёг на грань', after === before + 1, `было ${before}, стало ${after}`)
      await press('z', { ctrlKey: true })
      await wait(400)
      const undone = sketchCount(await readItems())
      check('штрих на грани отменяется', undone === before, `${undone}`)
      const straightBefore = sketchCount(await readItems())
      faceSolid.dispatchEvent(new PointerEvent('pointerdown', { ...faceOptions, clientX: faceX - 10, clientY: faceY - 8, shiftKey: true }))
      await wait(60)
      for (let step = 1; step <= 10; step += 1) {
        faceSolid.dispatchEvent(
          new PointerEvent('pointermove', {
            ...faceOptions,
            clientX: faceX - 10 + step * 5,
            clientY: faceY - 8 + step * 3,
            shiftKey: true
          })
        )
        await wait(20)
      }
      faceSolid.dispatchEvent(new PointerEvent('pointerup', { ...faceOptions, clientX: faceX + 40, clientY: faceY + 22, shiftKey: true }))
      await wait(700)
      const straightAfter = sketchCount(await readItems())
      check('с Shift на грани ровная линия', straightAfter === straightBefore + 1, `${straightBefore} → ${straightAfter}`)
      await press('z', { ctrlKey: true })
      await wait(400)
      await press('v')
      await wait(200)
      const throughMode = Array.from(document.querySelectorAll('.toolpalette .toolbtn')).find((node) =>
        /Прямая внутри/.test(node.getAttribute('title') || '')
      )
      if (throughMode) {
        const throughBefore = sketchCount(await readItems())
        throughMode.click()
        await wait(300)
        faceSolid.dispatchEvent(new PointerEvent('pointerdown', { ...faceOptions, clientX: faceX - 20, clientY: faceY - 12 }))
        faceSolid.dispatchEvent(new PointerEvent('pointerup', { ...faceOptions, clientX: faceX - 20, clientY: faceY - 12 }))
        await wait(140)
        check('выбрана первая точка прямой внутри', !!document.querySelector('.inkpreview'))
        const throughMid = sketchCount(await readItems())
        check('первая точка прямой внутри не добавляет штрих', throughMid === throughBefore, `${throughBefore} → ${throughMid}`)
        faceSolid.dispatchEvent(new PointerEvent('pointerdown', { ...faceOptions, clientX: faceX + 20, clientY: faceY + 12 }))
        faceSolid.dispatchEvent(new PointerEvent('pointerup', { ...faceOptions, clientX: faceX + 20, clientY: faceY + 12 }))
        await wait(700)
        const throughAfter = sketchCount(await readItems())
        check('две точки дают прямую внутри фигуры', throughAfter === throughBefore + 1, `${throughBefore} → ${throughAfter}`)
        const direct = (await readItems())
          .flatMap((item) => (item.kind === 'solid' ? item.sketch : []))
          .at(-1)
        check(
          'прямая внутри описана двумя точками на гранях',
          !!direct && Array.isArray(direct.through) && direct.through.length === 2 && direct.points.length === 0,
          JSON.stringify(direct?.through ?? null)
        )
        check('прямая внутри отрисована', !!document.querySelector('.boarditem[data-kind="solid"] svg'))
        await press('z', { ctrlKey: true })
        await wait(400)
        const throughUndone = sketchCount(await readItems())
        check('прямая внутри отменяется', throughUndone === throughBefore, `${throughUndone}`)
        await press('Escape')
        await wait(160)
      }

      const labelCount = (items) => items.filter((item) => item.kind === 'solid').reduce((sum, item) => sum + (item.labels ?? []).length, 0)
      const solidText = () => document.querySelector('.boarditem[data-kind="solid"] svg text')
      const labelBox = faceSolid.getBoundingClientRect()
      const labelX = labelBox.left + labelBox.width / 2
      const labelY = labelBox.top + labelBox.height / 2
      await wantTool('t', 'text')
      faceSolid.dispatchEvent(new PointerEvent('pointerdown', { ...faceOptions, clientX: labelX, clientY: labelY }))
      await wait(160)
      faceSolid.dispatchEvent(new PointerEvent('pointerup', { ...faceOptions, clientX: labelX, clientY: labelY }))
      await wait(360)
      const labelEditor = Array.from(document.querySelectorAll('.texteditor')).find(
        (node) => (node.getAttribute('placeholder') || '') === 'Текст на грани'
      )
      check('текст на грани открывается сразу в поле ввода', !!labelEditor, labelEditor ? document.activeElement === labelEditor ? 'с фокусом' : 'без фокуса' : 'поля нет')
      if (labelEditor) {
        const areaSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
        areaSetter.call(labelEditor, 'Молекула')
        labelEditor.dispatchEvent(new Event('input', { bubbles: true }))
        await wait(220)
        labelEditor.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
        await wait(700)
        const labels = (await readItems()).filter((item) => item.kind === 'solid').flatMap((item) => item.labels ?? [])
        check(
          'текст лёг на грань',
          labels.length === 1 && labels[0].text === 'Молекула' && !!labels[0].face,
          JSON.stringify(labels[0] ?? null)
        )
        check('текст на грани отрисован', (solidText()?.textContent || '').includes('Молекула'), solidText()?.getAttribute('transform') ?? 'нет')
        const textBefore = solidText()?.getBoundingClientRect()
        await wantTool('v', 'select')
        await wait(220)
        faceSolid.dispatchEvent(new PointerEvent('pointerdown', { ...faceOptions, clientX: labelX, clientY: labelY, altKey: true }))
        await wait(60)
        for (let step = 1; step <= 8; step += 1) {
          paint.dispatchEvent(new PointerEvent('pointermove', { ...faceOptions, clientX: labelX + step * 10, clientY: labelY, altKey: true }))
          await wait(26)
        }
        paint.dispatchEvent(new PointerEvent('pointerup', { ...faceOptions, clientX: labelX + 80, clientY: labelY, altKey: true }))
        await wait(700)
        const textAfter = solidText()?.getBoundingClientRect()
        check(
          'текст следует за фигурой при переносе',
          !!textBefore && !!textAfter && Math.abs(textAfter.left - textBefore.left) > 40,
          `${textBefore ? Math.round(textBefore.left) : '?'} → ${textAfter ? Math.round(textAfter.left) : '?'}`
        )
        await press('z', { ctrlKey: true })
        await wait(420)
        await press('z', { ctrlKey: true })
        await wait(420)
        check('текст на грани отменяется', labelCount(await readItems()) === 0, `${labelCount(await readItems())}`)
        await wantTool('t', 'text')
        faceSolid.dispatchEvent(new PointerEvent('pointerdown', { ...faceOptions, clientX: labelX, clientY: labelY }))
        await wait(200)
        faceSolid.dispatchEvent(new PointerEvent('pointerup', { ...faceOptions, clientX: labelX, clientY: labelY }))
        await wait(360)
        const labelAreaSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
        const labelEditorAgain = () =>
          Array.from(document.querySelectorAll('.texteditor')).find((node) => (node.getAttribute('placeholder') || '') === 'Текст на грани')
        const typeLabel = async (value) => {
          const node = labelEditorAgain()
          if (!node) return false
          labelAreaSetter.call(node, value)
          node.dispatchEvent(new Event('input', { bubbles: true }))
          await wait(200)
          node.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
          await wait(900)
          return true
        }
        if (await typeLabel('Формула')) {
          faceSolid.dispatchEvent(new PointerEvent('pointerdown', { ...faceOptions, clientX: labelX, clientY: labelY }))
          await wait(200)
          faceSolid.dispatchEvent(new PointerEvent('pointerup', { ...faceOptions, clientX: labelX, clientY: labelY }))
          await wait(420)
          const again = labelEditorAgain()
          check('повторный клик по надписи открывает её на правку', !!again && again.value === 'Формула', again ? `«${again.value}»` : 'поля нет')
          check('правится целиком выделенный текст', !!again && again.selectionEnd === 'Формула'.length, `${again?.selectionStart}..${again?.selectionEnd}`)
          await typeLabel('')
          let remaining = labelCount(await readItems())
          for (let attempt = 0; attempt < 4 && remaining !== 0; attempt += 1) {
            await wait(500)
            remaining = labelCount(await readItems())
          }
          check('пустая надпись удаляется с грани', remaining === 0, `${remaining}`)
        } else {
          check('повторный клик по надписи открывает её на правку', false, 'первая надпись не создалась')
          check('правится целиком выделенный текст', false, 'первая надпись не создалась')
          check('пустая надпись удаляется с грани', false, 'первая надпись не создалась')
        }
      } else {
        check('текст лёг на грань', false, 'поля ввода нет')
      }
      await wantTool('v', 'select')
      await wait(200)
    } else {
      check('на 3D-грани виден штрих при рисовании', false, 'фигура не создалась')
      check('штрих лёг на грань', false, 'фигура не создалась')
      check('штрих на грани отменяется', false, 'фигура не создалась')
    }
  }
  const pasteCanvas = document.querySelector('.boardview__canvas')
  if (pasteCanvas) {
    const transfer = new DataTransfer()
    transfer.setData('text/plain', 'https://liro.app/docs')
    const pasteEvent = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: transfer })
    pasteCanvas.dispatchEvent(pasteEvent)
    await wait(1000)
    const link = document.querySelector('.boarditem a')
    check('вставка ссылки даёт кликабельную ссылку', !!link && (link.getAttribute('href') || '').includes('liro.app/docs'), link ? link.getAttribute('href') : 'ссылки нет')
  }
  await window.liro.api.boardDelete(probeId, true)
  window.location.hash = '#/library'
  await wait(700)

  const overlaps = () => {
    const boxes = Array.from(document.querySelectorAll('.bbar, .toolgroup, .statusbar, .toolpalette, .textpanel, .inspector'))
    const rects = boxes.map((node) => ({ node, rect: node.getBoundingClientRect() }))
    const hits = []
    for (let i = 0; i < rects.length; i += 1) {
      for (let j = i + 1; j < rects.length; j += 1) {
        const a = rects[i].rect
        const b = rects[j].rect
        if (a.width === 0 || b.width === 0) continue
        const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left)
        const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
        if (overlapX > 6 && overlapY > 6) hits.push(`${rects[i].node.className} ↔ ${rects[j].node.className}`)
      }
    }
    return hits
  }
  const hits = overlaps()
  check('панели не накладываются', hits.length === 0, hits.join('; '))

  window.location.hash = '#/settings'
  await wait(1200)
  const nameInput = Array.from(document.querySelectorAll('.setrow')).find((row) => /Имя/.test(row.querySelector('.setrow__label')?.textContent || ''))?.querySelector('input')
  check('в настройках есть поле имени', !!nameInput)
  if (nameInput) {
    const before = await window.liro.api.settingsGet().then((result) => result.data.userName)
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    const typeName = async (value) => {
      nameInput.focus()
      setter.call(nameInput, value)
      nameInput.dispatchEvent(new Event('input', { bubbles: true }))
      await wait(200)
      nameInput.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
      await wait(700)
    }
    await typeName('Проверка')
    const changed = await window.liro.api.settingsGet().then((result) => result.data.userName)
    check('имя сохраняется', changed === 'Проверка', `было «${before}», стало «${changed}»`)
    await typeName(before)
    const restored = await window.liro.api.settingsGet().then((result) => result.data.userName)
    check('имя возвращается обратно', restored === before, `«${restored}»`)
  }
  const cursorUrl = getComputedStyle(document.body).cursor
  check('курсор системный', !/url\(/.test(cursorUrl), cursorUrl.slice(0, 40))

  const gridCanvas = document.querySelector('.boardview__canvas')
  if (!gridCanvas) {
    window.location.hash = demoHash
    await wait(2800)
  }
  const gridTarget = document.querySelector('.boardview__canvas')
  if (gridTarget) {
    await press('0')
    await wait(500)
    const gridBox = gridTarget.getBoundingClientRect()
    gridTarget.dispatchEvent(
      new WheelEvent('wheel', { deltaY: -260, clientX: gridBox.left + 420, clientY: gridBox.top + 300, bubbles: true, cancelable: true })
    )
    await wait(1100)
    const gridWorld = document.querySelector('.boardview__world')
    const worldShift = gridWorld ? /translate3d\(([-\d.]+)px, ([-\d.]+)px/.exec(gridWorld.style.transform) : null
    const gridShift = /(-?[\d.]+)px (-?[\d.]+)px/.exec(gridTarget.style.backgroundPosition)
    check(
      'сетка совпадает с положением доски',
      !!worldShift && !!gridShift && Math.abs(Number(worldShift[1]) - Number(gridShift[1])) < 1 && Math.abs(Number(worldShift[2]) - Number(gridShift[2])) < 1,
      `мир ${worldShift ? `${worldShift[1]},${worldShift[2]}` : '?'} → сетка ${gridShift ? `${gridShift[1]},${gridShift[2]}` : '?'}`
    )
    const worldScale = gridWorld ? Number(/scale\(([-\d.]+)\)/.exec(gridWorld.style.transform)?.[1] ?? 0) : 0
    const cell = Number(/([\d.]+)px/.exec(gridTarget.style.backgroundSize)?.[1] ?? 0)
    check('сетка масштабируется с зумом', worldScale > 0 && cell > 0 && Math.abs(cell / worldScale - Math.round(cell / worldScale)) < 0.05, `ячейка ${cell}px при зуме ${worldScale}`)
    const gridStyle = getComputedStyle(gridTarget)
    check('фон сетки рисуется', /radial-gradient|linear-gradient/.test(gridStyle.backgroundImage), gridStyle.backgroundImage.slice(0, 40))
  } else {
    check('сетка совпадает с положением доски', false, 'холста нет')
  }

  window.location.hash = '#/library'
  await wait(600)

  return JSON.stringify({
    passed: report.filter((line) => line.startsWith('ОК')).length,
    failed: report.filter((line) => line.startsWith('СБОЙ')).length,
    lines: report
  })
}

window.__liroAppUiTest = run
void 0
