import { Menu, X } from 'lucide-react';
import React, { useRef, type MouseEvent } from 'react';
import { FiLogOut } from 'react-icons/fi';
import type { IconType } from 'react-icons/lib';
import { useTranslation } from 'react-i18next';
import EUonQoLSurveyHubDx from '../assets/EUonQoLSurveyHub_dx.png';
import { DevnutButton } from './DevnutButton';
import { NavbarIconItem } from './NavbarIconItem';
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from './ui/sheet';

interface NavbarMobileProps {
  pages: { label: string; path: string; icon: IconType }[];
  /** Pagine extra (es. Settings, Profile) mostrate in basso nel menu */
  extraPages: { label: string; path: string; icon: IconType }[];
  currentPath: string;
  handleSignOut: () => void;
}

export const NavbarMobile = ({
  pages,
  extraPages,
  currentPath,
  handleSignOut,
}: NavbarMobileProps) => {
  const { t } = useTranslation(['common']);
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  // Cambio pagina dal menu: alla chiusura il focus va al contenuto, non all'hamburger
  const navigatedRef = useRef(false);

  // La navigazione la fa il <Link>; qui si chiude il menu. Clic con modificatori o col tasto
  // centrale aprono una nuova scheda: la pagina corrente non cambia e il menu resta com'è.
  const handleNavigate = (e: MouseEvent<HTMLAnchorElement>, path: string) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    navigatedRef.current = path !== currentPath;
    setMobileMenuOpen(false);
  };

  // AppLayout sposta il focus su <main> al cambio pagina, ma finché lo Sheet è aperto il suo
  // focus trap lo respinge e alla chiusura Radix lo riporta sul trigger: qui lo si dirige
  // esplicitamente sul contenuto (WCAG 2.4.3). Senza navigazione resta il comportamento di Radix.
  const handleCloseAutoFocus = (e: Event) => {
    if (!navigatedRef.current) return;
    e.preventDefault();
    navigatedRef.current = false;
    document.getElementById('main-content')?.focus({ preventScroll: true });
  };

  return (
    <div className="bg-white flex items-center justify-between relative px-4 h-14 shadow-[0px_4px_4px_0px_rgba(0,0,0,0.25)]">
      {/* Left: Hamburger */}
      <div className="flex items-center">
        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <SheetTrigger asChild>
            <DevnutButton
              variant="link"
              size="icon"
              className="p-0 mr-2 hover:bg-transparent"
              aria-label={t('navbar.menu')}
            >
              <Menu className="size-6" />
            </DevnutButton>
          </SheetTrigger>
          <SheetContent
            side="left"
            className="p-0 h-[calc(100dvh-56px)] mt-14"
            showCloseButton={false}
            onCloseAutoFocus={handleCloseAutoFocus}
          >
            <SheetTitle className="sr-only">{t('navbar.menu')}</SheetTitle>
            <div className="flex flex-col h-full p-4">
              {/* Chiusura esplicita per utenti touch/switch, oltre a Esc e click sull'overlay */}
              <div className="flex justify-end">
                <SheetClose asChild>
                  <DevnutButton
                    variant="link"
                    size="icon"
                    className="p-0 hover:bg-transparent"
                    aria-label={t('navbar.close_menu')}
                  >
                    <X className="size-6" />
                  </DevnutButton>
                </SheetClose>
              </div>
              {/* Navigation Links */}
              <nav aria-label={t('navbar.main_navigation')} className="flex-1">
                <div className=" flex flex-col gap-4">
                  {pages.map((page) => (
                    <div key={page.path}>
                      <NavbarIconItem
                        icon={page.icon}
                        label={page.label}
                        to={page.path}
                        isActive={
                          page.path === '/'
                            ? currentPath === '/'
                            : currentPath.startsWith(page.path)
                        }
                        onClick={(e) => handleNavigate(e, page.path)}
                        isMobile
                      />
                    </div>
                  ))}
                </div>
              </nav>

              {/* Bottom Actions */}
              <div className="border-t border-[#E8E8E8] pt-2 flex flex-col items-start gap-2">
                {extraPages.map((item) => (
                  <div key={item.path}>
                    <NavbarIconItem
                      icon={item.icon}
                      label={item.label}
                      to={item.path}
                      isActive={
                        item.path === '/' ? currentPath === '/' : currentPath.startsWith(item.path)
                      }
                      onClick={(e) => handleNavigate(e, item.path)}
                      isMobile
                    />
                  </div>
                ))}
                <DevnutButton
                  onClick={handleSignOut}
                  variant="link"
                  className="w-full justify-start text-[#c62828] h-10 text-sm px-3 hover:text-[#c62828] hover:bg-red-50"
                >
                  <FiLogOut aria-hidden="true" focusable="false" className="mr-2 h-4 w-4" />
                  {t('navbar.sign_out')}
                </DevnutButton>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Right: Logo */}
      <div className="flex items-center">
        <img
          src={EUonQoLSurveyHubDx}
          alt={t('navbar.logo_alt')}
          className="h-10 w-auto object-contain"
        />
      </div>
    </div>
  );
};
