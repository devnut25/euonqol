import { DevnutBadge } from '@/components/DevnutBadge';
import { useValueEnum } from '@/hooks/useValueEnum';
import { cn } from '@/lib/tailwind/utils';
import { SurveyStatusEnum } from '@/utils/enum';

export const STATUS_STYLES: Record<string, string> = {
  [SurveyStatusEnum.Draft]: 'bg-yellow-100 text-yellow-800',
  [SurveyStatusEnum.Public]: 'bg-blue-100 text-blue-800',
  [SurveyStatusEnum.Disabled]: 'bg-red-100 text-red-700',
  [SurveyStatusEnum.Completed]: 'bg-emerald-100 text-emerald-800',
};

/** Colori pieni (per pallino/dot), stessa famiglia di STATUS_STYLES ma satura */
export const STATUS_DOT_STYLES: Record<string, string> = {
  [SurveyStatusEnum.Draft]: 'bg-yellow-500',
  [SurveyStatusEnum.Public]: 'bg-blue-500',
  [SurveyStatusEnum.Disabled]: 'bg-red-500',
  [SurveyStatusEnum.Completed]: 'bg-emerald-500',
};

interface StatusBadgeProps {
  status: string;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const { valueEnum } = useValueEnum();
  const label = valueEnum.surveyStatus?.[status] ?? status;

  return (
    <DevnutBadge
      variant="secondary"
      className={cn('font-medium min-w-[90px] justify-center capitalize', STATUS_STYLES[status])}
    >
      {label}
    </DevnutBadge>
  );
}
