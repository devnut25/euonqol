import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/tailwind/utils";
import type { VariantProps } from "class-variance-authority";

interface DevnutButtonProps
  extends React.ComponentProps<"button">,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

function DevnutButton({
  className,
  variant = "default",
  size = "default",
  type = "button",
  ...props
}: DevnutButtonProps) {
  return (
    <Button
      {...props}
      // Con asChild l'elemento reso è il figlio (es. un <Link>): `type` vale solo per <button>
      type={props.asChild ? undefined : type}
      variant={variant}
      size={size}
      className={cn(
        "rounded-full text-sm md:text-base cursor-pointer",
        variant == "default" && "hover:bg-[#554fa3]",
        className
      )}
    />
  );
}

export { DevnutButton };
