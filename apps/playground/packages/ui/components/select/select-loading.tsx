import { ChevronsUpDown, LoaderCircle } from "lucide-react";

import { cn } from "@/packages/ui/lib/utils";

type SelectLoadingProps = {
  className?: string;
  loadingText?: string;
};

export function SelectLoading({
  className,
  loadingText = "加载中...",
}: SelectLoadingProps) {
  return (
    <div
      className={cn(
        "flex min-h-9 w-full items-center justify-between gap-2 px-3 py-1",
        "rounded-md border border-input bg-transparent text-sm shadow-xs",
        "cursor-not-allowed opacity-50",
        className
      )}
      tabIndex={-1}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
        <LoaderCircle className="size-4 animate-spin opacity-50" />
        <span className="text-muted-foreground">{loadingText}</span>
      </div>
      <ChevronsUpDown className="h-4 w-4 opacity-50" />
    </div>
  );
}
