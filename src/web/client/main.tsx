import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import { App } from './components/app.tsx'
import { ErrorBoundary } from './components/error-boundary.tsx'

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Could not find root element')
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
)
