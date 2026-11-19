import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('На странице нет элемента #root, на который монтируется приложение')
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
