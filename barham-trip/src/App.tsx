import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './hooks/useAuth'
import RequireAuth from './components/RequireAuth'
import AppLayout from './components/AppLayout'
import Login from './routes/Login'
import Today from './routes/Today'
import Trip from './routes/Trip'
import Leg from './routes/Leg'
import Day from './routes/Day'
import Bookings from './routes/Bookings'
import Packing from './routes/Packing'
import Costs from './routes/Costs'
import Me from './routes/Me'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route
            element={
              <RequireAuth>
                <AppLayout />
              </RequireAuth>
            }
          >
            <Route index element={<Today />} />
            <Route path="trip" element={<Trip />} />
            <Route path="leg/:id" element={<Leg />} />
            <Route path="day/:n" element={<Day />} />
            <Route path="bookings" element={<Bookings />} />
            <Route path="packing" element={<Packing />} />
            <Route path="costs" element={<Costs />} />
            <Route path="me" element={<Me />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
