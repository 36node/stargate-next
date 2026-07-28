"use client";

import { CirclePlusIcon } from "lucide-react";

import { Badge } from "@/packages/ui/components/shadcn/badge";
import { Button } from "@/packages/ui/components/shadcn/button";
import { Separator } from "@/packages/ui/components/shadcn/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/packages/ui/components/shadcn/tooltip";
import { cn } from "@/packages/ui/lib/utils";

// 正则表达式定义在顶层，避免每次渲染时重新创建
const DATE_RANGE_REGEX = /^\d{4}-\d{2}-\d{2}~\d{4}-\d{2}-\d{2}$/;

type FilterButtonProps = {
  title: string;
  selectedLabels?: string[];
  className?: string;
  icon?: React.ReactNode;
};

function FilterButton({
  title,
  selectedLabels = [],
  className,
  icon,
  ref,
  ...props
}: FilterButtonProps & { ref?: React.Ref<HTMLButtonElement> }) {
  return (
    <Tooltip>
      <TooltipTrigger
        asChild
        /**
         * 获得焦点时 不必要让tooltip显示
         * 这么处理是因为 当sheet关闭时 sheet会将焦点给tooltip
         * 这时tooltip就在页面显示且不会消失 除非再次hover
         */
        onFocus={(e: React.FocusEvent) => {
          e.preventDefault();
        }}
      >
        <Button
          className={cn("gap-2 border-dashed", className)}
          ref={ref}
          size="sm"
          variant="outline"
          {...props}
        >
          {icon || <CirclePlusIcon className="h-4 w-4" />}
          <div className="hidden h-full items-center lg:flex">
            {title}
            {selectedLabels?.length > 0 && (
              <>
                <Separator
                  className="mx-2 h-4 shrink-0"
                  orientation="vertical"
                />
                <Badge
                  className="rounded-sm px-1 font-normal lg:hidden"
                  variant="secondary"
                >
                  {selectedLabels.length}
                </Badge>
                <div className="flex items-center gap-1">
                  {selectedLabels.length > 2 ? (
                    <Badge
                      className="rounded-sm px-1 font-normal"
                      variant="secondary"
                    >
                      {selectedLabels.length} 项过滤
                    </Badge>
                  ) : (
                    selectedLabels.map((label) => {
                      const isDateRange = DATE_RANGE_REGEX.test(label);
                      return (
                        <Badge
                          className="rounded-sm px-1 font-normal"
                          key={label}
                          variant="secondary"
                        >
                          <span
                            className={
                              isDateRange
                                ? undefined
                                : "max-w-18 overflow-hidden text-ellipsis whitespace-nowrap text-nowrap xl:max-w-24"
                            }
                          >
                            {label}
                          </span>
                        </Badge>
                      );
                    })
                  )}
                </div>
              </>
            )}
          </div>
        </Button>
      </TooltipTrigger>
      <TooltipContent className="flex items-center gap-1 lg:hidden">
        {title}
        {selectedLabels.length > 0 && (
          <>
            <Separator
              className="mx-1 shrink-0 data-[orientation=vertical]:h-2"
              orientation="vertical"
            />
            {selectedLabels.length > 2 ? (
              <span>{selectedLabels.length} 项过滤</span>
            ) : (
              selectedLabels.map((label) => <span key={label}>{label}</span>)
            )}
          </>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

export { FilterButton };
