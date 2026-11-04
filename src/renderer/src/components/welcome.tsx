import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowRight } from 'lucide-react'
import logo from '../../../../resources/icon-256.png'
import { api } from '../lib/api'
import { useApp } from '../lib/store'

export function FirstRunName(): ReactNode {
  const settings = useApp((state) => state.settings)
  const setSettings = useApp((state) => state.setSettings)
  const fail = useApp((state) => state.fail)
  const [name, setName] = useState('')
  const [ready, setReady] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (settings === null) return
    setName(settings.userName ?? '')
    setReady(true)
  }, [settings])

  useEffect(() => {
    if (!ready || (settings?.userName ?? '').trim()) return
    window.setTimeout(() => inputRef.current?.focus(), 120)
  }, [ready, settings])

  if (!ready) return null
  if ((settings?.userName ?? '').trim()) return null

  const save = async (): Promise<void> => {
    const value = name.trim()
    if (!value) return
    try {
      setSettings(await api.settings.set({ userName: value }))
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error))
      inputRef.current?.focus()
    }
  }

  return (
    <div className="welcome">
      <div className="welcome__card">
        <img className="welcome__logo" src={logo} alt="" />
        <h1 className="welcome__title">Как к вам обращаться?</h1>
        <p className="welcome__lead">
          Имя запомнится на этом компьютере. Оно будет в приветствии на главной странице.
        </p>
        <input
          ref={inputRef}
          className="input welcome__input"
          value={name}
          maxLength={40}
          placeholder="Например, Максим"
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void save()
          }}
        />
        <button type="button" className="btn btn--primary welcome__go" disabled={!name.trim()} onClick={() => void save()}>
          Дальше
          <ArrowRight size={15} />
        </button>
      </div>
    </div>
  )
}