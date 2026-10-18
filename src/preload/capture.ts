import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('__liroBridge', {
  send: (type: string, payload: unknown) => {
    ipcRenderer.send('source:bridge', { type, payload })
  }
})