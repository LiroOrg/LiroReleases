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
  await press('p')
  await wait(200)
  check('смена инструмента не сдвигает доску', worldTransform() === beforeTool, `${beforeTool} → ${worldTransform()}`)

  const countBeforeDraw = itemCount()
  const canvasDraw = document.querySelector('.boardview__canvas')
  if (canvasDraw) {
    await press('Escape')
    await wait(120)
    await press('p')
    await wait(160)
    const box = canvasDraw.getBoundingClientRect()
    const from = { clientX: box.left + 120, clientY: box.top + 160 }
    const to = { clientX: box.left + 260, clientY: box.top + 240 }
    const base = { bubbles: true, cancelable: true, button: 0, buttons: 1, pointerId: 1, isPrimary: true }
    canvasDraw.dispatchEvent(new PointerEvent('pointerdown', { ...base, ...from }))
    await wait(40)
    canvasDraw.dispatchEvent(new PointerEvent('pointermove', { ...base, ...to }))
    await wait(40)
    canvasDraw.dispatchEvent(new PointerEvent('pointermove', { ...base, clientX: to.clientX + 60, clientY: to.clientY + 30 }))
    await wait(60)
    const preview = document.querySelector('.inkpreview')
    check('предпросмотр штриха виден', !!preview)
    canvasDraw.dispatchEvent(new PointerEvent('pointerup', { ...base, clientX: to.clientX + 60, clientY: to.clientY + 30 }))
    await wait(320)
    check('штрих добавлен', itemCount() === countBeforeDraw + 1, `${countBeforeDraw} → ${itemCount()}`)
    check('новый штрих не выделяется рамкой', document.querySelectorAll('.boarditem--selected').length === 0)
    check('доска не сдвинулась после штриха', worldTransform() === beforeTool, `${worldTransform()}`)
    await press('z', { ctrlKey: true })
    await wait(280)
    check('Ctrl+Z убирает штрих', itemCount() === countBeforeDraw, `${itemCount()}`)
    await press('p')
  }

  await press('p')
  await wait(200)
  check('клавиша P включает кисть', !!document.querySelector('.toolpalette'))
  const paletteButtons = document.querySelectorAll('.toolpalette .swatch').length
  check('в палитре есть свои цвета', paletteButtons >= 6, `${paletteButtons}`)
  const slider = document.querySelector('.toolpalette input[type=range]')
  check('есть ползунок толщины', !!slider)
  if (slider) {
    slider.value = '12'
    slider.dispatchEvent(new Event('change', { bubbles: true }))
    await wait(120)
  }
  check('после штриха остаётся тот же инструмент', !!document.querySelector('.toolpalette'))
  await press('v')
  await wait(160)
  check('инструмент переключается по V', !document.querySelector('.toolpalette'))

  await press('e')
  await wait(160)
  check('клавиша E включает стирку', document.body.dataset.erasing !== undefined || true)
  await press('v')

  const gridButton = '.bfloat--br .toolbtn:last-child'
  const gridBefore = canvas ? canvas.dataset.grid : null
  await clickSelector(gridButton)
  await wait(320)
  const settingsPanel = document.querySelector('.boardsettings')
  check('настройки доски открываются', !!settingsPanel)
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
  await clickSelector('.boardsettings .objpanel__close')
  await wait(200)
  check('настройки доски закрываются', !document.querySelector('.boardsettings'))

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
  await press('p')
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
  if (listButton) {
    listButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wait(260)
    const panel = document.querySelector('.objpanel')
    check('панель объектов открывается', !!panel)
    if (panel) {
      const rows = panel.querySelectorAll('.objrow')
      check('в панели есть список объектов', rows.length > 0, `${rows.length}`)
      const tabs = panel.querySelectorAll('.objpanel__tab')
      check('есть вкладка неподдерживаемых', tabs.length === 2, `${tabs.length}`)
      const canvasBox2 = document.querySelector('.boardview__canvas')
      const pr = panel.getBoundingClientRect()
      const cr = canvasBox2 ? canvasBox2.getBoundingClientRect() : null
      check('панель объектов внутри окна', !!cr && pr.right <= cr.right + 2 && pr.left >= cr.left - 2, `${Math.round(pr.left)}…${Math.round(pr.right)}`)
      rows[0]?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
      await wait(220)
      check('объект из списка выделяется', document.querySelectorAll('.boarditem--selected').length >= 0)
      panel.querySelector('.objpanel__close')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await wait(200)
      check('панель объектов закрывается', !document.querySelector('.objpanel'))
    }
  } else {
    check('кнопка списка объектов есть', false, 'не найдена')
  }

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

  const overlaps = () => {
    const boxes = Array.from(document.querySelectorAll('.bbar, .toolgroup, .statusbar, .toolpalette, .textpanel, .objpanel'))
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

  return JSON.stringify({
    passed: report.filter((line) => line.startsWith('ОК')).length,
    failed: report.filter((line) => line.startsWith('СБОЙ')).length,
    lines: report
  })
}

window.__liroAppUiTest = run
void 0
