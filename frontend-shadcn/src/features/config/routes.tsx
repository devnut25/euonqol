import { lazy, type ReactNode } from 'react';
import { extraNavigationItems, navigationItems, type NavigationItem } from './navigation';

// Lazy loading dei componenti
// In questo modo i componenti vengono caricati solo quando necessari
const Homepage = lazy(() => import('@/pages/Homepage'));
const Survey = lazy(() => import('@/pages/Survey'));
const Patients = lazy(() => import('@/pages/Patients'));
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const ModuleLibrary = lazy(() => import('@/pages/ModuleLibrary'));
const Users = lazy(() => import('@/pages/Users'));
const Settings = lazy(() => import('@/pages/Settings'));
const Profile = lazy(() => import('@/pages/Profile'));

// Mappa path -> componente lazy
const componentMap: Record<string, ReactNode> = {
  '/': <Homepage />,
  '/survey': <Survey />,
  '/patients': <Patients />,
  '/dashboard': <Dashboard />,
  '/module-library': <ModuleLibrary />,
  '/users': <Users />,
  '/settings': <Settings />,
  '/profile': <Profile />,
};

export interface RouteConfig extends NavigationItem {
  element: ReactNode;
}

// Combina navigationItems con i componenti lazy
export const protectedRoutesConfig: RouteConfig[] = navigationItems.map((item) => ({
  ...item,
  element: componentMap[item.path],
}));

export const protectedExtraRoutesConfig: RouteConfig[] = extraNavigationItems.map((item) => ({
  ...item,
  element: componentMap[item.path],
}));
