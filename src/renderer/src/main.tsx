import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/fonts.css'
import './styles/theme.css'
import './styles/app.css'
import './styles/home.css'
import './styles/preview.css'
import 'highlight.js/styles/github-dark.css'
import './styles/board.css'
import './styles/board-extra.css'
import './styles/panel.css'
import { App } from './App'

const container = document.getElementById('root')
if (container) {
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>
  )
}