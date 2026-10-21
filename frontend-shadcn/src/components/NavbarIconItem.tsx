import clsx from 'clsx';
import type { MouseEvent } from 'react';
import type { IconType } from 'react-icons/lib';
import { Link } from 'react-router-dom';
import { DevnutButton } from './DevnutButton';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

interface NavItemProps {
  icon: IconType;
  label: string;
  /** Destinazione: la voce è un link vero (apribile in nuova scheda, URL visibile) */
  to: string;
  isActive: boolean;
  onClick?: (e: MouseEvent<HTMLAnchorElement>) => void;
  isMobile?: boolean;
}

export const NavbarIconItem = ({
  icon: Icon,
  label,
  to,
  isActive,
  onClick,
  isMobile,
}: NavItemProps) => {
  const link = (
    <DevnutButton
      asChild
      variant="link"
      className="p-0 h-full"
      // Desktop: icona sola, il nome accessibile viene da qui. Mobile: il testo è visibile
      // e fa già da nome (WCAG 2.5.3).
      aria-label={isMobile ? undefined : label}
      aria-current={isActive ? 'page' : undefined}
    >
      <Link to={to} onClick={onClick}>
        <div
          className={clsx(
            'rounded-full inline-flex items-center justify-center size-9',
            isActive
              ? 'bg-primary text-white hover:bg-[#554fa3] hover:text-white forced-colors:outline-2 forced-colors:outline-solid forced-colors:outline-[Highlight]'
              : 'bg-[#F9F9F9] text-primary hover:bg-[#ececec]'
          )}
        >
          <Icon aria-hidden="true" focusable="false" className="size-6" />
        </div>
        {isMobile && (
          <span className={clsx('font-semibold', isActive ? 'text-primary' : 'text-primary')}>
            {label}
          </span>
        )}
      </Link>
    </DevnutButton>
  );

  if (isMobile) return link;

  // Icona senza testo: tooltip visibile anche da tastiera (hover + focus, Esc lo chiude).
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
};
