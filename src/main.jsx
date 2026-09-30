import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

// ?mesa3d=sim → standalone 3D-table simulator (piece 1a, test-only). Lazy: without the flag the
// app is unchanged and three.js is never downloaded.
const MesaSim = new URLSearchParams(location.search).get('mesa3d') === 'sim'
  ? React.lazy(() => import('./mesa3d/MesaSim.jsx'))
  : null

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {MesaSim ? (
      <React.Suspense fallback={null}>
        <MesaSim />
      </React.Suspense>
    ) : (
      <App />
    )}
  </React.StrictMode>,
)
