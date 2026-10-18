declare global {
  interface Window {
    liro: {
      api: import('@shared/api').ApiLiro
      subscribe: <K extends keyof import('@shared/api').Events>(
        channel: K,
        handler: (payload: import('@shared/api').Events[K]) => void
      ) => () => void
    }
    __liroBridge?: {
      send: (type: string, payload: unknown) => void
    }
    __LIRO_CFG?: {
      port: number
      token: string
      endpoint?: string
    }
    __liroAppCollectorActive?: {
      run: () => void
      stop: () => void
      state: () => Record<string, unknown>
    }
  }
}

export {}