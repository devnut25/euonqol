import { DevnutBadge } from '@/components/DevnutBadge';
import { useValueEnum } from '@/hooks/useValueEnum';
import { cn } from '@/lib/tailwind/utils';
import { QuestionnaireStatusEnum } from '@/utils/enum';

const STATUS_STYLES: Record<QuestionnaireStatusEnum, string> = {
  [QuestionnaireStatusEnum.Draft]: 'bg-yellow-100 text-yellow-800',
  [QuestionnaireStatusEnum.Public]: 'bg-green-100 text-green-800',
  [QuestionnaireStatusEnum.Disabled]: 'bg-red-100 text-red-700',
  [QuestionnaireStatusEnum.Completed]: 'bg-emerald-100 text-emerald-800',
};

interface StatusBadgeProps {
  status: QuestionnaireStatusEnum;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const { valueEnum } = useValueEnum();
  const label = valueEnum.questionnaireStatus?.[status] ?? status;

  return (
    <DevnutBadge
      variant="secondary"
      className={cn('font-medium min-w-[90px] justify-center capitalize', STATUS_STYLES[status])}
    >
      {label}
    </DevnutBadge>
  );
}
