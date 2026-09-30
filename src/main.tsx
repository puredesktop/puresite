import { createRoot } from 'react-dom/client'
import { App } from './App'
import { WhiteNeutral } from './whiteNeutral'

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
