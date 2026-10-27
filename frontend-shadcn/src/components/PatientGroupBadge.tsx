import { DevnutBadge } from '@/components/DevnutBadge';
import { cn } from '@/lib/tailwind/utils';

const GROUP_STYLES = [
  'bg-blue-100 text-blue-800',
  'bg-purple-100 text-purple-800',
  'bg-amber-100 text-amber-800',
  'bg-emerald-100 text-emerald-800',
  'bg-rose-100 text-rose-800',
  'bg-cyan-100 text-cyan-800',
  'bg-orange-100 text-orange-800',
  'bg-indigo-100 text-indigo-800',
];

/** Stable colour per group name, so the same group always gets the same badge. */
const styleForGroup = (name: string) => {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return GROUP_STYLES[hash % GROUP_STYLES.length];
};

interface PatientGroupBadgeProps {
  name?: string | null;
  description?: string | null;
  className?: string;
}

/** Coloured badge for a patient group ("Group D - UNDEFINED"). */
export function PatientGroupBadge({ name, description, className }: PatientGroupBadgeProps) {
  if (!name) return <span className="text-muted-foreground">—</span>;

  return (
    <DevnutBadge
      variant="secondary"
      className={cn('font-medium', styleForGroup(name), className)}
    >
      {description ? `${name} - ${description}` : name}
    </DevnutBadge>
  );
}
