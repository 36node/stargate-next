import type { ReactNode } from "react";

export type SelectOption<TData = unknown> = {
  key: string;
  label: string;
  value: TData;
  className?: string;
  disabled?: boolean;
  icon?: ReactNode;
};
