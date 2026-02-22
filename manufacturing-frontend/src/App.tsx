import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'

import Login from './pages/Login'
import AdminDocuments from './pages/admin/Documents'
import AdminTrainingDetail from './pages/admin/TrainingDetail'
import EmployeeTrainings from './pages/employee/Trainings'
import EmployeeTrainingDetail from './pages/employee/TrainingDetail'

function RootRedirect() {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (user.role === 'admin') return <Navigate to="/admin/documents" replace />
  return <Navigate to="/employee/trainings" replace />
}

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<Login />} />

      {/* Admin routes */}
      <Route
        path="/admin/documents"
        element={
          <ProtectedRoute role="admin">
            <AdminDocuments />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/trainings/:id"
        element={
          <ProtectedRoute role="admin">
            <AdminTrainingDetail />
          </ProtectedRoute>
        }
      />

      {/* Employee routes */}
      <Route
        path="/employee/trainings"
        element={
          <ProtectedRoute role="employee">
            <EmployeeTrainings />
          </ProtectedRoute>
        }
      />
      <Route
        path="/employee/trainings/:id"
        element={
          <ProtectedRoute role="employee">
            <EmployeeTrainingDetail />
          </ProtectedRoute>
        }
      />

      {/* Root redirect */}
      <Route path="/" element={<RootRedirect />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
