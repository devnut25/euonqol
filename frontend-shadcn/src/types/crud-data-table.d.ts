import type { ReactNode } from "react";

export interface Item extends Values {
  id: string;
  created_at?: string;
  updated_at?: string;
}

export type ActionOnSave = 
  | "detail" 
  | "list" 
  | { type: "custom"; route: (data: Values) => string };

export interface ParentBreadcrumb {
  label: string;
  onClick?: () => void;
}

export interface Tab {
  key: string;
  label: string;
  children: ReactNode | ((ctx: { parentBreadcrumbs: ParentBreadcrumb[] }) => ReactNode);
}