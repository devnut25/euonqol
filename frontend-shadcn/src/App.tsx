import { lazy, Suspense } from 'react';
import { Navigate, Route, BrowserRouter as Router, Routes } from 'react-router-dom';
import { AccessibilityMenu } from './components/accessibility/AccessibilityMenu';
import { DocumentTitle } from './components/DocumentTitle';
import ErrorBoundary from './components/ErrorBoundary';
import ProtectedRoute from './components/ProtectedRoute';
import RoleProtectedRoute from './components/RoleProtectRoute';
import { Toaster } from './components/ui/sonner';
import { protectedExtraRoutesConfig, protectedRoutesConfig } from './features/config/routes';
import { AuthLayout } from './layouts/AuthLayout';
import { TooltipProvider } from './components/ui/tooltip';
import { AccessibilityProvider } from './providers/AccessibilityProvider';
import { AuthProvider } from './providers/AuthProvider';
import { ValueEnumProvider } from './providers/ValueEnumProvider';
import { UserTypeEnum } from './utils/enum';

// Lazy loading per le pagine di autenticazione
const Login = lazy(() => import('./pages/Auth/Login'));
const ResetPassword = lazy(() => import('./pages/Auth/ResetPassword'));
const ResetPasswordConfirm = lazy(() => import('./pages/Auth/ResetPasswordConfirm'));
const FirstAccess = lazy(() => import('./pages/Auth/FirstAccess'));
const TwoFactor = lazy(() => import('./pages/Auth/TwoFactor'));
const ModuleLibraryUpload = lazy(() => import('./pages/ModuleLibraryUpload'));
const CatItemBankUpload = lazy(() => import('./pages/CatItemBankUpload'));
const PatientsUpload = lazy(() => import('./pages/PatientsUpload'));
const QuestionnairePreview = lazy(() => import('./pages/QuestionnairePreview'));
const PublicQuestionnaire = lazy(() => import('./pages/PublicQuestionnaire'));
// Admin shell (navbar, sidebar…) — lazy so patients on /q/:link and users on the
// auth pages don't download it.
const AppLayout = lazy(() => import('./layouts/AppLayout'));

// Componente di loading personalizzato
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-dvh">
    <div
      role="status"
      aria-label="Loading"
      className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"
    ></div>
  </div>
);

function App() {
  return (
    <Router>
      <ErrorBoundary>
        <DocumentTitle />
        <TooltipProvider>
          <AccessibilityProvider>
            <ValueEnumProvider>
              <AuthProvider>
                {/* Toast sopra il pulsante accessibilità fisso in basso a destra */}
                <Toaster
                  position="bottom-right"
                  offset={{ bottom: '5.5rem' }}
                  mobileOffset={{ bottom: '5rem' }}
                />
                <AccessibilityMenu />
                <Suspense fallback={<PageLoader />}>
                  <Routes>
                    {/* Public questionnaire route — no auth required */}
                    <Route path="/q/:link" element={<PublicQuestionnaire />} />

                    {/* Public routes with AuthLayout */}
                    <Route element={<AuthLayout />}>
                      <Route path="/login" element={<Login />} />
                      <Route path="/reset-password" element={<ResetPassword />} />
                      <Route path="/reset-password-confirm" element={<ResetPasswordConfirm />} />
                      <Route path="/first-access" element={<FirstAccess />} />
                      <Route path="/two-factor" element={<TwoFactor />} />
                    </Route>

                    {/* Protected routes with AppLayout */}
                    <Route element={<ProtectedRoute />}>
                      <Route element={<AppLayout />}>
                        {protectedRoutesConfig.map((route) => (
                          <Route
                            key={route.path}
                            path={route.path}
                            element={
                              <RoleProtectedRoute allowedRoles={route.allowedRoles}>
                                {route.element}
                              </RoleProtectedRoute>
                            }
                          />
                        ))}

                        {protectedExtraRoutesConfig.map((route) => (
                          <Route
                            key={route.path}
                            path={route.path}
                            element={
                              <RoleProtectedRoute allowedRoles={route.allowedRoles}>
                                {route.element}
                              </RoleProtectedRoute>
                            }
                          />
                        ))}

                        <Route
                          path="/module-library/upload"
                          element={
                            <RoleProtectedRoute allowedRoles={[UserTypeEnum.Admin]}>
                              <ModuleLibraryUpload />
                            </RoleProtectedRoute>
                          }
                        />

                        <Route
                          path="/cat-item-banks/upload"
                          element={
                            <RoleProtectedRoute allowedRoles={[UserTypeEnum.Admin]}>
                              <CatItemBankUpload />
                            </RoleProtectedRoute>
                          }
                        />

                        <Route
                          path="/patients/upload"
                          element={
                            <RoleProtectedRoute
                              allowedRoles={[UserTypeEnum.Admin, UserTypeEnum.Manager]}
                            >
                              <PatientsUpload />
                            </RoleProtectedRoute>
                          }
                        />

                        <Route
                          path="/survey/:surveyId/questionnaires/preview"
                          element={
                            <RoleProtectedRoute
                              allowedRoles={[UserTypeEnum.Admin, UserTypeEnum.Manager]}
                            >
                              <QuestionnairePreview />
                            </RoleProtectedRoute>
                          }
                        />

                        <Route path="*" element={<Navigate to="/" replace />} />
                      </Route>
                    </Route>
                  </Routes>
                </Suspense>
              </AuthProvider>
            </ValueEnumProvider>
          </AccessibilityProvider>
        </TooltipProvider>
      </ErrorBoundary>
    </Router>
  );
}

export default App;
