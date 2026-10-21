import { extraNavigationItems, navigationItems } from '@/features/config/navigation';
import { useAuth } from '@/hooks/useAuth';
import clsx from 'clsx';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FiLogOut } from 'react-icons/fi';
import { Link, useLocation } from 'react-router-dom';
import logo from '../assets/EUonQoLSurveyHub.png';
import { DevnutButton } from './DevnutButton';
import { NavbarIconItem } from './NavbarIconItem';
import { NavbarMobile } from './NavbarMobile';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

const HEADER_HEIGHT = 75;
const HEADER_HEIGHT_MOBILE = 56;

type NavbarProps = {
  isMobile?: boolean;
};

const Navbar: React.FC<NavbarProps> = ({ isMobile = false }) => {
  const { logout, user } = useAuth();
  const { t } = useTranslation(['common']);
  const { pathname } = useLocation();
  const currentPath = pathname;

  const handleSignOut = () => {
    logout();
  };

  // Filtra le pagine in base al ruolo dell'utente
  const visiblePages = useMemo(() => {
    if (!user?.user_type) return [];

    return navigationItems
      .filter((route) => route.allowedRoles?.includes(user.user_type))
      .map((route) => ({
        label: t(route.labelKey),
        path: route.path,
        icon: route.icon,
      }));
  }, [user, t]);

  const visibleExtraPages = useMemo(() => {
    if (!user?.user_type) return [];

    return extraNavigationItems
      .filter((route) => route.allowedRoles?.includes(user.user_type))
      .map((route) => ({
        label: t(route.labelKey),
        path: route.path,
        icon: route.icon,
      }));
  }, [user, t]);

  if (isMobile) {
    return (
      <NavbarMobile
        pages={visiblePages}
        extraPages={visibleExtraPages}
        currentPath={currentPath}
        handleSignOut={handleSignOut}
      />
    );
  }

  return (
    <div className={clsx('w-full', !isMobile && 'mt-4')}>
      <div className="w-11/12 mx-auto rounded-[160px] pointer-events-auto">
        <div
          className="flex items-center justify-between relative rounded-[100px] bg-white px-3 sm:px-6"
          style={{
            minHeight: isMobile ? HEADER_HEIGHT_MOBILE : HEADER_HEIGHT,
          }}
        >
          {/* Logo Desktop */}
          <div className="flex items-center" style={{ height: HEADER_HEIGHT }}>
            <img src={logo} alt={t('navbar.logo_alt')} className="h-10 w-auto object-contain" />
          </div>

          <nav
            aria-label={t('navbar.main_navigation')}
            className="flex flex-1 justify-center gap-3 px-4"
          >
            {visiblePages.map((page) => {
              const selected =
                page.path === '/' ? currentPath === '/' : currentPath.startsWith(page.path);
              return (
                <DevnutButton
                  key={page.path}
                  asChild
                  aria-current={selected ? 'page' : undefined}
                  className={clsx(
                    'min-w-[120px]',
                    selected
                      ? 'bg-primary text-white font-bold shadow-[0px_4px_4px_0px_rgba(0,0,0,0.25)]'
                      : 'bg-[#F9F9F9] text-[#475A6F] font-medium shadow-none hover:bg-[#ececec]'
                  )}
                >
                  <Link to={page.path}>{page.label}</Link>
                </DevnutButton>
              );
            })}
          </nav>

          {/* Desktop Icons — icon-only, so each one gets a visible tooltip */}
          <div className="flex items-center gap-1">
            {visibleExtraPages.map((page) => {
              const selected =
                page.path === '/' ? currentPath === '/' : currentPath.startsWith(page.path);
              return (
                <NavbarIconItem
                  key={page.path}
                  icon={page.icon}
                  label={page.label}
                  to={page.path}
                  isActive={selected}
                />
              );
            })}

            <Tooltip>
              <TooltipTrigger asChild>
                <DevnutButton
                  onClick={handleSignOut}
                  variant="link"
                  className="size-9 text-[#c62828] hover:text-[#c62828] hover:bg-red-50"
                  aria-label={t('navbar.sign_out')}
                >
                  <FiLogOut aria-hidden="true" focusable="false" className="size-6" />
                </DevnutButton>
              </TooltipTrigger>
              <TooltipContent side="bottom">{t('navbar.sign_out')}</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Navbar;
