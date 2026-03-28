import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import App from './App'
import { AuthProvider } from './lib/AuthContext'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
        <Toaster
          position="bottom-center"
          toastOptions={{
            style: {
              background: '#28282f',
              color: '#f2f2f7',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '99px',
              fontSize: '13px',
              padding: '10px 18px',
            },
            success: { iconTheme: { primary: '#a01535', secondary: '#ffffff' } }
          }}
        />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
)
