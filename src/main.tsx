import { createRoot } from 'react-dom/client'
import { App } from './App'
import { WhiteNeutral } from './whiteNeutral'
import './compact-in-room.css'

// held inside another app's page: it lies flat in that page rather than as a page of its own
if (window.parent !== window.top) document.documentElement.setAttribute('data-held-in-room', '')

const root = document.getElementById('root')
if (!root) {
  throw new Error('Root element #root not found')
}

createRoot(root).render(
  <>
    <WhiteNeutral />
    <App />
  </>,
)
