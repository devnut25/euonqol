import { SplitScreenLayout } from './SplitScreenLayout';

export function PublicLayout({ children }: { children: React.ReactNode }) {
  return <SplitScreenLayout>{children}</SplitScreenLayout>;
}
