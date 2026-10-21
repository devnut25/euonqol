import { cn } from "@/lib/tailwind/utils";
import type { VariantProps } from "class-variance-authority";
import { Badge, badgeVariants } from "./ui/badge";

interface DevnutBadgeProps
  extends React.ComponentProps<"span">,
    VariantProps<typeof badgeVariants> {
  asChild?: boolean;
}

function DevnutBadge({
  className,
  variant = "default",
  ...props
}: DevnutBadgeProps) {
  return (
    <Badge
      {...props}
      variant={variant}
      className={cn("rounded-full text-black", className)}
    />
  );
}

export { DevnutBadge };
