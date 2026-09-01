import { lazy, Suspense, useEffect } from 'react'
import UpdatePrompt from './components/UpdatePrompt'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { syncPushSubscription } from './lib/push'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import TonightPage from './pages/TonightPage'
import TeamsPage from './pages/TeamsPage'
import MatchPage from './pages/MatchPage'
import HistoryPage from './pages/HistoryPage'
import CardsPage from './pages/CardsPage'
import FeedbackPage from './pages/FeedbackPage'
import StatsPage from './pages/StatsPage'
import MorePage from './pages/MorePage'
import AdminPage from './pages/AdminPage'
import ProfilePage from './pages/ProfilePage'
import ProfileMonthlyPage from './pages/ProfileMonthlyPage'

// Cup (tournament-only) and Pods are heavy and rarely visited — load them on
// demand so they don't bloat the main bundle for the weekly sign-up flow.
// Help articles ship as markdown strings so lazy them too to keep the main
// bundle lean; almost nobody hits Help every session.
const PodsPage = lazy(() => import('./pages/PodsPage'))
const CupPage = lazy(() => import('./pages/CupPage'))
const CupAdminPage = lazy(() => import('./pages/CupAdminPage'))
const HelpPage = lazy(() => import('./pages/HelpPage'))

function LoadingScreen() {
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

// Fires on every authenticated app boot: reconciles the browser's push
// subscription with the DB so a reinstall / cleared site data / rotated
// endpoint doesn't leave a player silently un-pinged. Never prompts —
// only acts when Notification permission is already granted.
function PushSubscriptionSync() {
  const { profile } = useAuth()
  useEffect(() => {
    if (!profile?.id) return
    syncPushSubscription(profile.id).then(r => {
      if (r.action !== 'noop' && r.action !== 'no-permission' && r.action !== 'unsupported') {
        console.info('[push-sync]', r)
      }
    })
  }, [profile?.id])
  return null
}

function ProtectedRoutes() {
  const { session, loading } = useAuth()

  if (loading) return <LoadingScreen />

  if (!session) return <Navigate to="/login" replace />

  return (
    <Suspense fallback={<LoadingScreen />}>
      <PushSubscriptionSync />
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<TonightPage />} />
          <Route path="teams" element={<TeamsPage />} />
          <Route path="match" element={<MatchPage />} />
          <Route path="history" element={<HistoryPage />} />
          <Route path="cards" element={<CardsPage />} />
          <Route path="stats" element={<StatsPage />} />
          <Route path="pods" element={<PodsPage />} />
          <Route path="more" element={<MorePage />} />
          <Route path="cup" element={<CupPage />} />
          <Route path="cup/admin" element={<CupAdminPage />} />
          <Route path="feedback" element={<FeedbackPage />} />
          <Route path="help" element={<HelpPage />} />
          <Route path="help/:slug" element={<HelpPage />} />
          <Route path="admin" element={<AdminPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="profile/monthly/:month" element={<ProfileMonthlyPage />} />
        </Route>
      </Routes>
    </Suspense>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        {/* App-wide: a new build can land while someone is on the login
            screen just as easily as mid-session. */}
        <UpdatePrompt />
        <div style={{ width: '100%', maxWidth: 430, margin: '0 auto', height: '100%', position: 'relative', overflowX: 'hidden' }}>
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
