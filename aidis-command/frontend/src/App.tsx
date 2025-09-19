import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import { AuthProvider } from './contexts/AuthContext';
import { ProjectProvider } from './contexts/ProjectContext';
import { FeatureFlagProvider } from './contexts/FeatureFlagContext';
import ProtectedRoute from './components/ProtectedRoute';
import AppLayout from './components/AppLayout';
import GlobalErrorBoundary from './components/error/GlobalErrorBoundary';
import SectionErrorBoundary from './components/error/SectionErrorBoundary';
import LoadingState from './components/common/LoadingState';
import './App.css';

const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Contexts = lazy(() => import('./pages/Contexts'));
const Tasks = lazy(() => import('./pages/Tasks'));
const Decisions = lazy(() => import('./pages/Decisions'));
const Naming = lazy(() => import('./pages/Naming'));
const Projects = lazy(() => import('./pages/Projects'));
const ProjectDetail = lazy(() => import('./pages/ProjectDetail'));
const Sessions = lazy(() => import('./pages/Sessions'));
const SessionDetail = lazy(() => import('./pages/SessionDetail'));
const Settings = lazy(() => import('./pages/Settings'));

// Ant Design theme configuration
const theme = {
  token: {
    colorPrimary: '#1890ff',
    borderRadius: 8,
    wireframe: false,
  },
  components: {
    Layout: {
      siderBg: '#001529',
      headerBg: '#ffffff',
    },
  },
};

const App: React.FC = () => {
  return (
    <ConfigProvider theme={theme}>
      <GlobalErrorBoundary>
        <Router>
          <AuthProvider>
            <FeatureFlagProvider>
              <ProjectProvider>
                <Suspense fallback={<LoadingState fullscreen message="Preparing AIDIS interface…" /> }>
                  <Routes>
                    {/* Public Routes */}
                    <Route path="/login" element={<SectionErrorBoundary section="Login"><Login /></SectionErrorBoundary>} />

                    {/* Protected Routes */}
                    <Route
                      path="/*"
                      element={
                        <ProtectedRoute>
                          <AppLayout />
                        </ProtectedRoute>
                      }
                    >
                      {/* Nested protected routes within the layout */}
                      <Route index element={<Navigate to="/dashboard" replace />} />
                      <Route path="dashboard" element={<SectionErrorBoundary section="Dashboard"><Dashboard /></SectionErrorBoundary>} />
                      <Route path="contexts" element={<SectionErrorBoundary section="Contexts"><Contexts /></SectionErrorBoundary>} />
                      <Route path="tasks" element={<SectionErrorBoundary section="Tasks"><Tasks /></SectionErrorBoundary>} />
                      <Route path="decisions" element={<SectionErrorBoundary section="Decisions"><Decisions /></SectionErrorBoundary>} />
                      <Route path="naming" element={<SectionErrorBoundary section="Naming"><Naming /></SectionErrorBoundary>} />
                      <Route path="projects" element={<SectionErrorBoundary section="Projects"><Projects /></SectionErrorBoundary>} />
                      <Route path="projects/:id" element={<SectionErrorBoundary section="Project Detail"><ProjectDetail /></SectionErrorBoundary>} />
                      <Route path="sessions" element={<SectionErrorBoundary section="Sessions"><Sessions /></SectionErrorBoundary>} />
                      <Route path="sessions/:id" element={<SectionErrorBoundary section="Session Detail"><SessionDetail /></SectionErrorBoundary>} />
                      <Route path="settings" element={<SectionErrorBoundary section="Settings"><Settings /></SectionErrorBoundary>} />

                      {/* Catch all - redirect to dashboard */}
                      <Route path="*" element={<Navigate to="/dashboard" replace />} />
                    </Route>
                  </Routes>
                </Suspense>
              </ProjectProvider>
            </FeatureFlagProvider>
          </AuthProvider>
        </Router>
      </GlobalErrorBoundary>
    </ConfigProvider>
  );
};

export default App;
