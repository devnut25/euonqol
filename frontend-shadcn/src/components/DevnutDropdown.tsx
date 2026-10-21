import React from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuShortcut,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/tailwind/utils";

export interface DevnutDropdownItem {
  label: string;
  onClick: () => void;
  className?: string;
  icon?: React.ReactNode;
  variant?: "default" | "destructive";
  inset?: boolean;
  disabled?: boolean;
  shortcut?: string;
}

export interface DevnutDropdownProps {
  trigger: React.ReactNode;
  items: DevnutDropdownItem[];
  contentClassName?: string;
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
  sideOffset?: number;
  contentWidth?: string;
}

function DevnutDropdown({
  trigger,
  items,
  contentClassName,
  align = "end",
  side = "bottom",
  sideOffset = 4,
  contentWidth,
}: DevnutDropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent
        align={align}
        side={side}
        sideOffset={sideOffset}
        className={cn(
          "w-[180px] rounded-md shadow-[0_2px_12px_rgba(60,60,60,0.10)] p-0",
          contentClassName
        )}
        style={contentWidth ? { width: contentWidth } : undefined}
      >
        {items.map((item, index) => (
          <DropdownMenuItem
            key={index}
            onClick={item.onClick}
            className={cn(
              "font-medium text-base cursor-pointer px-4 py-2.5 focus:rounded-none",
              item.className
            )}
            variant={item.variant || "default"}
            inset={item.inset}
            disabled={item.disabled}
          >
            {item.icon && <span className="mr-2">{item.icon}</span>}
            {item.label}
            {item.shortcut && (
              <DropdownMenuShortcut>{item.shortcut}</DropdownMenuShortcut>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export { DevnutDropdown };
