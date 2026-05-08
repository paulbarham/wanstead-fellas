import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import TonightPage from './pages/TonightPage'
import TeamsPage from './pages/TeamsPage'
import MatchPage from './pages/MatchPage'
import HistoryPage from './pages/HistoryPage'
import CardsPage from './pages/CardsPage'
import FeedbackPage from './pages/FeedbackPage'
import AdminPage from './pages/AdminPage'
import ProfilePage from './pages/ProfilePage'

function ProtectedRoutes() {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg)' }}>
        <div className="text-center">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-3"
            style={{ background: 'var(--color-primary)' }}>
            <span className="font-display text-xl text-white">WF</span>
          </div>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading...</p>
        </div>
      </div>
    )
  }

  if (!session) return <Navigate to="/login" replace />

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<TonightPage />} />
        <Route path="teams" element={<TeamsPage />} />
        <Route path="match" element={<MatchPage />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="cards" element={<CardsPage />} />
        <Route path="feedback" element={<FeedbackPage />} />
        <Route path="admin" element={<AdminPage />} />
        <Route path="profile" element={<ProfilePage />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <div style={{ maxWidth: 430, margin: '0 auto', height: '100%', position: 'relative' }}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/*" element={<ProtectedRoutes />} />
          </Routes>
        </div>
      </AuthProvider>
    </BrowserRouter>
  )
}
