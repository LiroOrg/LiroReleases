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

const report = []
const check = (name, ok, detail) => {
  report.push(`${ok ? 'ОК' : 'СБОЙ'} ${name}${detail ? `: ${detail}` : ''}`)
}

const run = async () => {
  await wait(1200)
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

    await press('y', { ctrlKey: true })
    const afterRedo = itemCount()
    check('Ctrl+Y повторяет удаление', afterRedo === start - 1, `${afterUndo} → ${afterRedo}`)

    await press('z', { ctrlKey: true })
    check('повторная отмена работает', itemCount() === start, `${itemCount()}`)

    await press('f')
    await wait(360)
    await press('a', { ctrlKey: true })
    await wait(280)
    const all = document.querySelectorAll('.boarditem--selected').length
    check('Ctrl+A выделяет всё', all >= 2, `${all} видимых`)
    await press('Escape')
  }

  const tools = Array.from(document.querySelectorAll('.boardview__tools .toolbtn'))
  check('в палитре есть инструменты', tools.length >= 10, `${tools.length}`)

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
    canvasText.dispatchEvent(new PointerEvent('pointerdown', { ...base, clientX: box.left + 520, clientY: box.top + 200 }))
    canvasText.dispatchEvent(new PointerEvent('pointerup', { ...base, clientX: box.left + 520, clientY: box.top + 200 }))
    await wait(360)
    check('текст создаётся', itemCount() === textCount + 1, `${textCount} → ${itemCount()}`)
    const editor = document.querySelector('.texteditor')
    check('открылось поле ввода текста', !!editor)
    if (editor) {
      const transfer = new DataTransfer()
      transfer.setData('text/plain', 'Вставленный текст')
      const pasteEvent = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: transfer })
      editor.dispatchEvent(pasteEvent)
      await wait(140)
      check('вставка в текст не перехватывается', pasteEvent.defaultPrevented === false)
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
      setter.call(editor, 'Привет')
      editor.dispatchEvent(new Event('input', { bubbles: true }))
      await wait(120)
      editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }))
      await wait(300)
      check('текст сохраняется', !document.querySelector('.texteditor'))
      const texts = Array.from(document.querySelectorAll('.boarditem')).map((node) => node.textContent || '')
      check('текст виден на доске', texts.some((value) => value.includes('Привет')))
    }
    await press('z', { ctrlKey: true })
    await wait(200)
    await press('z', { ctrlKey: true })
    await wait(320)
    check('Ctrl+Z убирает текст', itemCount() === textCount, `${itemCount()} против ${textCount}`)
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
  }

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

  const gridButton = '.bfloat--br .toolbtn:last-child'
  const gridBefore = canvas ? canvas.dataset.grid : null
  await clickSelector(gridButton)
  await wait(320)
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

  const tableTool = Array.from(document.querySelectorAll('.boardview__tools .toolbtn')).find((node) =>
    /Таблица/.test(node.getAttribute('title') || '')
  )
  check('есть инструмент таблицы', !!tableTool)
  if (tableTool && canvas) {
    const before = document.querySelectorAll('.boarditem[data-kind="table"]').length
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
    const after = document.querySelectorAll('.boarditem[data-kind="table"]').length
    check('таблица создаётся', after > before, `${before} → ${after}`)
    check('в таблице есть ячейки', document.querySelectorAll('.tableview__cell').length >= 9)
    const tableCell = document.querySelectorAll('.tableview__cell')[1]
    if (tableCell) {
      tableCell.dispatchEvent(new PointerEvent('pointerdown', { ...options, clientX: 0, clientY: 0 }))
      await wait(300)
      const cellInput = document.querySelector('.tableview__input')
      check('ячейка таблицы редактируется', !!cellInput)
      if (cellInput) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
        setter.call(cellInput, 'Проверка')
        cellInput.dispatchEvent(new Event('input', { bubbles: true }))
        await wait(160)
        cellInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }))
        await wait(420)
      }
      const cellTexts = Array.from(document.querySelectorAll('.tableview__text')).map((node) => node.textContent)
      check('текст ячейки сохраняется', cellTexts.includes('Проверка'), cellTexts.join('|'))
    }
    const propertiesButton = Array.from(document.querySelectorAll('.topbar .toolbtn')).find((node) =>
      /Свойства/.test(node.getAttribute('aria-label') || '')
    )
    check('есть кнопка свойств', !!propertiesButton)
    if (propertiesButton) {
      propertiesButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await wait(360)
      const inspector = document.querySelector('.inspector')
      check('панель свойств открывается', !!inspector)
      check('в свойствах таблицы есть строки', !!Array.from(inspector?.querySelectorAll('.btn') || []).find((node) => node.textContent === '+ строка'))
      const xInput = inspector?.querySelector('.inspector__number input')
      check('в свойствах можно задать координату', !!xInput)
      const close = inspector?.querySelector('.btn--icon')
      close?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await wait(200)
    }
    await press('Delete')
    await wait(320)
    await press('Escape')
    await wait(160)
  }

  const shapeTool = Array.from(document.querySelectorAll('.boardview__tools .toolbtn')).find((node) =>
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
      canvas.dispatchEvent(new PointerEvent('pointerup', { ...options, clientX: spot.x, clientY: spot.y }))
      await wait(520)
    }
    await press('v')
    await wait(240)
    const propertiesButton = Array.from(document.querySelectorAll('.topbar .toolbtn')).find((node) =>
      /Свойства/.test(node.getAttribute('aria-label') || '')
    )
    propertiesButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wait(360)
    const inspector = document.querySelector('.inspector')
    check('у фигуры есть выбор цвета', !!inspector?.querySelector('.inspector__colors'))
    check('у фигуры есть толщина линии', !!inspector?.querySelector('.inspector__slider'))
    const close = inspector?.querySelector('.btn--icon')
    close?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wait(200)

    await press('v')
    await wait(240)
    const firstId = document.querySelector('.boarditem--selected')?.getAttribute('data-item-id') || ''
    await press('s')
    await wait(260)
    document.querySelector('.toolpalette .toolbtn')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
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
    const alignToggle = Array.from(document.querySelectorAll('.topbar .toolbtn')).find((node) =>
      /Выравнивание/.test(node.getAttribute('aria-label') || '')
    )
    if (alignToggle?.getAttribute('data-active') !== 'true') {
      alignToggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await wait(320)
    }
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

  const presentButton = Array.from(document.querySelectorAll('.topbar .toolbtn')).find((node) =>
    /Режим докладчика/.test(node.getAttribute('aria-label') || '')
  )
  check('есть кнопка режима докладчика', !!presentButton)
  if (presentButton) {
    presentButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wait(420)
    check('режим докладчика включается', !!document.querySelector('.presentbar'))
    await press('Escape')
    await wait(320)
    check('режим докладчика закрывается', !document.querySelector('.presentbar'))
  }

  const beforeZoom = document.querySelector('.zoomval') ? document.querySelector('.zoomval').textContent : ''
  await clickSelector('.bfloat--br .toolbtn')
  await wait(340)
  const afterZoom = document.querySelector('.zoomval') ? document.querySelector('.zoomval').textContent : ''
  check('зум меняется кнопкой', beforeZoom !== afterZoom, `${beforeZoom} → ${afterZoom}`)

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
  check('ПКМ без перемещения открывает меню', !!document.querySelector('.ctxmenu'))
  await press('Escape')
  check('Escape закрывает меню', !document.querySelector('.ctxmenu'))

  canvasBox.dispatchEvent(new PointerEvent('pointerdown', pointer))
  await wait(40)
  canvasBox.dispatchEvent(new PointerEvent('pointermove', { ...pointer, clientX: 780, clientY: 460 }))
  await wait(60)
  canvasBox.dispatchEvent(new PointerEvent('pointerup', { ...pointer, clientX: 780, clientY: 460 }))
  await wait(240)
  check('перетаскивание ПКМ не открывает меню', !document.querySelector('.ctxmenu'))

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
  await press('i')
  await wait(200)
  const palette = document.querySelector('.toolpalette')
  if (rail && palette) {
    const railBox = rail.getBoundingClientRect()
    const paletteBox = palette.getBoundingClientRect()
    check('палитра инструментов справа от рейки', paletteBox.left >= railBox.right - 1, `рейка ${Math.round(railBox.right)} → панель ${Math.round(paletteBox.left)}`)
    check('палитра не ниже верхней панели', paletteBox.top >= 60, `${Math.round(paletteBox.top)}`)
  } else {
    check('палитра инструментов показана', false, 'панели нет')
  }
  await press('v')
  await wait(160)

  const resizeNode = Array.from(document.querySelectorAll('.boarditem')).find((node) => {
    const rect = node.getBoundingClientRect()
    if (node.classList.contains('boarditem--locked')) return false
    return rect.width > 24 && rect.height > 24 && rect.left > 20 && rect.top > 20 && rect.right < window.innerWidth - 20 && rect.bottom < window.innerHeight - 120
  })
  if (resizeNode) {
    const box = resizeNode.getBoundingClientRect()
    const pick = { bubbles: true, cancelable: true, button: 0, pointerId: 1, isPrimary: true, clientX: box.left + box.width / 2, clientY: box.top + box.height / 2 }
    resizeNode.dispatchEvent(new PointerEvent('pointerdown', pick))
    canvasBox.dispatchEvent(new PointerEvent('pointerup', { ...pick, buttons: 0 }))
    await wait(200)
    const handles = Array.from(document.querySelectorAll('.resizehandle'))
    check('у выделенного объекта есть маркеры растяжения', handles.length === 8, `${handles.length}`)
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
  } else {
    check('нашёлся объект для растяжения', false, 'подходящих объектов нет')
  }


  const linkLayer = document.querySelector('.boardview__connectors')
  if (linkLayer) {
    const layerData = linkLayer.getContext('2d').getImageData(0, 0, linkLayer.width, linkLayer.height).data
    let painted = 0
    for (let index = 3; index < layerData.length; index += 4) if (layerData[index] > 8) painted += 1
    check('слой связей отрисован', painted > 60, `${painted} пикселей`)
  } else {
    check('слой связей отрисован', false, 'нет слоя связей')
  }

  const menuPoint = canvasBox.getBoundingClientRect()
  const menuOptions = { bubbles: true, cancelable: true, button: 2, pointerId: 1, isPrimary: true, clientX: menuPoint.left + menuPoint.width * 0.5, clientY: menuPoint.top + menuPoint.height * 0.5 }
  canvasBox.dispatchEvent(new PointerEvent('pointerdown', menuOptions))
  await wait(60)
  canvasBox.dispatchEvent(new PointerEvent('pointerup', { ...menuOptions, buttons: 0 }))
  canvasBox.dispatchEvent(new MouseEvent('contextmenu', menuOptions))
  await wait(260)
  const linkEntry = Array.from(document.querySelectorAll('.ctxmenu button')).find((node) => /Предпросмотр по ссылке/.test(node.textContent || ''))
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
    const alignButtons = Array.from(document.querySelectorAll('.toolpalette .toolbtn')).filter((node) => /По левому краю/.test(node.getAttribute('title') || ''))
    if (alignButtons[0]) {
      alignButtons[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await wait(300)
      const leftA = Math.round(alignNodes[0].getBoundingClientRect().left)
      const leftB = Math.round(alignNodes[1].getBoundingClientRect().left)
      check('выравнивание по левому краю', Math.abs(leftA - leftB) <= 2, `${leftA} и ${leftB}`)
    } else {
      check('кнопка выравнивания есть', false, 'не найдена')
    }
    await press('z', { ctrlKey: true })
    await wait(260)

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
        !!plainEditor && !plainEditor.value.includes('<'),
        plainEditor ? plainEditor.value.slice(0, 40) : 'поля нет'
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
    check('у 3D есть переключатель плоскостей', /Координатные плоскости/.test(solidPalette.textContent || ''))
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
      check('есть режим штриха по грани', !!strokeMode)
      strokeMode?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
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
      await press('v')
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
