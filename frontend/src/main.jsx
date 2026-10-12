import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { LanguageProvider } from './i18n';
import ProtectedRoute from './auth/ProtectedRoute';
import Landing from './pages/Landing';
import HowItWorks from './pages/HowItWorks';
import Login from './pages/Login';
import ResetPassword from './pages/ResetPassword';
import PatientLayout from './pages/patient/PatientLayout';
import Reports from './pages/patient/Reports';
import ReportDetail from './pages/patient/ReportDetail';
import Chat from './pages/patient/Chat';
import Appointments from './pages/patient/Appointments';
import Prescriptions from './pages/patient/Prescriptions';
import Reminders from './pages/patient/Reminders';
import DoctorLayout from './pages/doctor/DoctorLayout';
import Today from './pages/doctor/Today';
import Patients from './pages/doctor/Patients';
import PatientView from './pages/doctor/PatientView';
import DeskLayout from './pages/receptionist/DeskLayout';
import Book from './pages/receptionist/Book';
import Bookings from './pages/receptionist/Bookings';
import Upload from './pages/receptionist/Upload';
import './styles.css';

function NotFound() {
  return (
    <div className="center"><div className="card" style={{ textAlign: 'center' }}>
      <h2>Page not found</h2>
      <p className="sub">The page you're looking for doesn't exist.</p>
      <a className="btn" href="/">Back home</a>
    </div></div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <LanguageProvider>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/how-it-works" element={<HowItWorks />} />
          <Route path="/login" element={<Login />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          <Route element={<ProtectedRoute roles={['patient']} />}>
            <Route path="/app" element={<PatientLayout />}>
              <Route index element={<Navigate to="reports" replace />} />
              <Route path="reports" element={<Reports />} />
              <Route path="reports/:id" element={<ReportDetail />} />
              <Route path="chat" element={<Chat />} />
              <Route path="appointments" element={<Appointments />} />
              <Route path="prescriptions" element={<Prescriptions />} />
              <Route path="reminders" element={<Reminders />} />
            </Route>
          </Route>

          <Route element={<ProtectedRoute roles={['doctor']} />}>
            <Route path="/doctor" element={<DoctorLayout />}>
              <Route index element={<Navigate to="today" replace />} />
              <Route path="today" element={<Today />} />
              <Route path="patients" element={<Patients />} />
              <Route path="patients/:id" element={<PatientView />} />
            </Route>
          </Route>

          <Route element={<ProtectedRoute roles={['receptionist']} />}>
            <Route path="/desk" element={<DeskLayout />}>
              <Route index element={<Navigate to="book" replace />} />
              <Route path="book" element={<Book />} />
              <Route path="bookings" element={<Bookings />} />
              <Route path="upload" element={<Upload />} />
            </Route>
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </AuthProvider>
      </LanguageProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
