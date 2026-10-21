import { Button } from "@/components/ui/button";
import { cn } from "@/lib/tailwind/utils";
import { Eye, EyeOff } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { DevnutInput } from "./DevnutInput";
import { Input } from "./ui/input";

function DevutPasswordInput({
  className,
  endAdornment,
  ...props
}: React.ComponentProps<typeof Input> & { endAdornment?: ReactNode }) {
  const { t } = useTranslation(["common"]);
  const [showPassword, setShowPassword] = useState(false);

  const toggleLabel = t(
    showPassword ? "common:buttons.values.hidePassword" : "common:buttons.values.showPassword"
  );

  const renderIcon = () => {
    const Icon = showPassword ? EyeOff : Eye;
    return <Icon className="h-4 w-4 text-muted-foreground" />;
  };

  return (
    <div className="w-full space-y-2">
      <div className="relative">
        <DevnutInput
          {...props}
          type={showPassword ? "text" : "password"}
          className={cn(endAdornment && "pr-28", className)}
        />
        <div className="absolute top-0 right-0 h-full flex items-center gap-1 pr-1">
          {endAdornment}
          <Button
            className="h-full px-3 hover:bg-transparent"
            onClick={() => setShowPassword(!showPassword)}
            size="icon"
            type="button"
            variant="ghost"
            aria-label={toggleLabel}
            aria-pressed={showPassword}
          >
            {renderIcon()}
          </Button>
        </div>
      </div>
    </div>
  );
}

export { DevutPasswordInput };
