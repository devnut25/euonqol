import { Loader2Icon } from "lucide-react";

import { cn } from "@/lib/tailwind/utils";

export const Spinner = (props: { full?: boolean; className?: string }) => {
  return (
    <span
      role="status"
      className={cn(props.full && "flex flex-1 items-center justify-center")}
    >
      <Loader2Icon
        aria-hidden="true"
        className={cn("animate-spin", props.className)}
      />
      <span className="sr-only">Loading</span>
    </span>
  );
};
