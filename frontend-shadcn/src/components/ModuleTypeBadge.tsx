import { DevnutBadge } from '@/components/DevnutBadge';
import { useValueEnum } from '@/hooks/useValueEnum';
import { cn } from '@/lib/tailwind/utils';
import { ModuleKindEnum } from '@/utils/enum';

const TYPE_STYLES: Record<string, string> = {
  [ModuleKindEnum.Static]: 'bg-blue-100 text-blue-800',
  [ModuleKindEnum.Dynamic]: 'bg-purple-100 text-purple-800',
  [ModuleKindEnum.SocioDemo]: 'bg-amber-100 text-amber-800',
  [ModuleKindEnum.Additional]: 'bg-amber-100 text-amber-800',
};

interface ModuleTypeBadgeProps {
  type: string;
  className?: string;
}

/** Badge for a module / questionnaire type (static, dynamic, socio-demo, ...). */
export function ModuleTypeBadge({ type, className }: ModuleTypeBadgeProps) {
  const { valueEnum } = useValueEnum();
  const label = valueEnum.moduleType?.[type] ?? type;

  return (
    <DevnutBadge
      variant="secondary"
      className={cn(
        'font-medium capitalize',
        TYPE_STYLES[type] ?? 'bg-gray-100 text-gray-700',
        className
      )}
    >
      {label}
    </DevnutBadge>
  );
}
