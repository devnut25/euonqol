import { Outlet } from 'react-router-dom';
import { SplitScreenLayout } from './SplitScreenLayout';

export const AuthLayout = () => (
  <SplitScreenLayout>
    <Outlet />
  </SplitScreenLayout>
);
