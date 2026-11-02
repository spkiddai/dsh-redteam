import { createRoot } from 'react-dom/client'
import { App } from './App.js'
import { DASHBOARD_STYLES } from '../styles.js'
const style = document.createElement('style')
style.textContent = '*{box-sizing:border-box}body{margin:0}' + DASHBOARD_STYLES
document.head.appendChild(style)
createRoot(document.getElementById('root')!).render(<App />)
