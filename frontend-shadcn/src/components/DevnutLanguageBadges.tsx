import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/tailwind/utils';

interface LanguageItem {
  id: string | number;
  language: string;
}

interface DevnutLanguageBadgesProps {
  languages: LanguageItem[];
  label: string;
  emphasized?: boolean;
}

export const DevnutLanguageBadges = ({ languages, label, emphasized }: DevnutLanguageBadgesProps) => (
  <div className="flex justify-between items-start">
    {label && (
      <Label className={cn(emphasized ? 'font-bold text-primary' : 'text-black')}>{label}</Label>
    )}
    <div className="flex flex-wrap gap-1.5 justify-end ml-auto">
      {languages.length === 0 ? (
        <span className="text-sm text-muted-foreground">—</span>
      ) : (
        [...languages]
          .sort((a, b) => a.language.localeCompare(b.language))
          .map((lang) => (
            <Badge key={lang.id} variant="outline" className="text-xs font-normal">
              {lang.language}
            </Badge>
          ))
      )}
    </div>
  </div>
);
