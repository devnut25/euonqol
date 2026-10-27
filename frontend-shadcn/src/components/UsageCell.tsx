import { DevnutBadge } from '@/components/DevnutBadge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ClipboardList, FileText, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface CountBadgeProps {
  icon: LucideIcon;
  count: number;
  label: string;
  className: string;
}

function CountBadge({ icon: Icon, count, label, className }: CountBadgeProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <DevnutBadge
          variant="secondary"
          className={`gap-1 font-medium ${className}`}
          aria-label={label}
        >
          <Icon className="size-3.5" aria-hidden />
          {count}
        </DevnutBadge>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

interface UsageCellProps {
  surveyCount: number;
  questionnaireCount: number;
}

/** Compact survey / questionnaire usage counters for the module library table. */
export function UsageCell({ surveyCount, questionnaireCount }: UsageCellProps) {
  const { t } = useTranslation(['management']);

  if (surveyCount === 0 && questionnaireCount === 0) {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <div className="flex items-center gap-1.5">
      <CountBadge
        icon={ClipboardList}
        count={surveyCount}
        label={t('common.usage.survey_count', { count: surveyCount })}
        className="bg-blue-100 text-blue-800"
      />
      <CountBadge
        icon={FileText}
        count={questionnaireCount}
        label={t('common.usage.questionnaire_count', { count: questionnaireCount })}
        className="bg-emerald-100 text-emerald-800"
      />
    </div>
  );
}
