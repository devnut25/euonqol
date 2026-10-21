import backgroundImage from '@/assets/EUonQoLSurveyHub_logo_background.png';
import DevnutSection from '@/components/DevnutSection';
import Navbar from '@/components/Navbar';
import { t } from 'i18next';
import React, { Suspense, useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Footer from '../components/Footer';

const PageLoader = () => (
  <div className="flex items-center justify-center min-h-100">
    <div
      role="status"
      aria-label={t('common:loading.label')}
      className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"
    ></div>
  </div>
);

const AppLayout: React.FC = () => {
  const mainRef = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  const isFirstRender = useRef(true);

  // Al cambio pagina il focus passa al contenuto: tastiera e screen reader ripartono da lì (WCAG 2.4.3).
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    mainRef.current?.focus({ preventScroll: true });
  }, [pathname]);

  return (
    <div className="min-h-dvh flex flex-col bg-slate-50 relative">
      <a
        href="#main-content"
        onClick={(e) => {
          e.preventDefault();
          mainRef.current?.focus();
        }}
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-100 focus:rounded-full focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        {t('common:layout.skip_to_content')}
      </a>
      {/* Layer per l'immagine di sfondo */}
      <div
        className="absolute inset-0 bg-center bg-no-repeat opacity-10 pointer-events-none"
        style={{
          backgroundImage: `url(${backgroundImage})`,
          backgroundSize: 'min(65%, 600px) auto',
        }}
      />

      <header className="w-full sticky top-0 left-0 right-0 z-55">
        <div className="lg:hidden">
          <Navbar isMobile />
        </div>

        <div className="hidden lg:block">
          <Navbar />
        </div>
      </header>

      <main
        id="main-content"
        ref={mainRef}
        tabIndex={-1}
        className="flex-1 md:w-11/12 md:mx-auto py-4 relative outline-none"
      >
        <Suspense fallback={<PageLoader />}>
          <DevnutSection.Grid className="gap-2">
            <Outlet />
          </DevnutSection.Grid>
        </Suspense>
      </main>

      <Footer />
    </div>
  );
};

export default AppLayout;
