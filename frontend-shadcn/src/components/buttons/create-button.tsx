import { Button } from '@/components/ui/button';
import { useIsTablet } from '@/hooks/useMediaQuery';
import { cn } from '@/lib/tailwind/utils';
import { t } from 'i18next';
import type { ComponentPropsWithoutRef } from 'react';
import { DevnutButton } from '../DevnutButton';

export interface CreateButtonProps extends ComponentPropsWithoutRef<typeof Button> {
  label?: string;
}

export const CreateButton = ({
  label = t('common:buttons.values.create'),
  className,
  ...props
}: CreateButtonProps) => {
  const isTablet = useIsTablet();

  return (
    <DevnutButton
      className={cn('text-sm md:px-8', className)}
      size={isTablet ? 'xs' : 'default'}
      {...props}
    >
      {label}
    </DevnutButton>
  );
};
