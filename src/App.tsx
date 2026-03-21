import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './lib/AuthContext'
import AuthPage from './pages/AuthPage'
import AppShell from './components/AppShell'

export default function App() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div className="spinner" style={{ width: 32, height: 32 }} />
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/auth" element={!user ? <AuthPage /> : <Navigate to="/" replace />} />
      <Route path="/*" element={user ? <AppShell /> : <Navigate to="/auth" replace />} />
    </Routes>
  )
}
