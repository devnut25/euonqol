import { ModuleKindEnum } from '@/utils/enum';

const TYPE_STYLES: Record<string, string> = {
  [ModuleKindEnum.Static]: 'bg-blue-100 text-blue-800',
  [ModuleKindEnum.Dynamic]: 'bg-purple-100 text-purple-800',
  [ModuleKindEnum.SocioDemo]: 'bg-amber-100 text-amber-800',
  [ModuleKindEnum.Additional]: 'bg-amber-100 text-amber-800',
};

export function TypeBadge({ type }: { type: string }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${
        TYPE_STYLES[type] ?? 'bg-gray-100 text-gray-700'
      }`}
    >
      {type}
    </span>
  );
}
