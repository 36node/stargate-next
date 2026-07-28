"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useCallback, useState } from "react";

import { Button } from "@/packages/ui/components/shadcn/button";
import { cn } from "@/packages/ui/lib/utils";

export type YearPickerProps = {
  /** 当前选中的年份 */
  selected?: Date;
  /** 年份选择回调 */
  onSelect?: (date: Date | undefined) => void;
  /** 禁用逻辑 */
  disabled?: boolean | ((date: Date) => boolean) | Date[];
  /** 自定义类名 */
  className?: string;
  /** 最小年份（默认 2020） */
  fromYear?: number;
  /** 最大年份（默认当前年份） */
  toYear?: number;
};

const YEARS_PER_PAGE = 12; // 每页显示12个年份（3行 x 4列）

/**
 * 年份选择器组件
 */
export function YearPicker({
  selected,
  onSelect,
  disabled,
  className,
  fromYear = 2020,
  toYear = new Date().getFullYear(),
}: YearPickerProps) {
  const currentYear = new Date().getFullYear();
  const selectedYear = selected ? selected.getFullYear() : undefined;

  // 计算总页数
  const totalYears = toYear - fromYear + 1;
  const totalPages = Math.ceil(totalYears / YEARS_PER_PAGE);

  // 当前页（基于选中年份或当前年份）
  const defaultPage = selectedYear
    ? Math.floor((selectedYear - fromYear) / YEARS_PER_PAGE)
    : Math.floor((currentYear - fromYear) / YEARS_PER_PAGE);

  const [page, setPage] = useState(
    Math.max(0, Math.min(defaultPage, totalPages - 1))
  );

  // 计算当前页显示的年份
  const startYear = fromYear + page * YEARS_PER_PAGE;
  const endYear = Math.min(startYear + YEARS_PER_PAGE - 1, toYear);
  const years = Array.from(
    { length: endYear - startYear + 1 },
    (_, i) => startYear + i
  );

  // 判断日期是否被禁用
  const isYearDisabled = useCallback(
    (year: number) => {
      if (!disabled) {
        return false;
      }

      const date = new Date(year, 0, 1);

      if (typeof disabled === "function") {
        return disabled(date);
      }

      if (Array.isArray(disabled)) {
        return disabled.some((d) => d.getFullYear() === year);
      }

      return false;
    },
    [disabled]
  );

  // 处理年份选择
  const handleYearClick = (year: number) => {
    if (isYearDisabled(year)) {
      return;
    }
    const date = new Date(year, 0, 1);
    onSelect?.(date);
  };

  // 处理翻页
  const handlePreviousPage = () => {
    setPage((prev) => Math.max(0, prev - 1));
  };

  const handleNextPage = () => {
    setPage((prev) => Math.min(totalPages - 1, prev + 1));
  };

  const canGoPrevious = page > 0;
  const canGoNext = page < totalPages - 1;

  return (
    <div
      className={cn(
        "bg-background p-3 [--cell-size:--spacing(8)]",
        "[[data-slot=popover-content]_&]:bg-transparent",
        className
      )}
    >
      {/* 导航栏 */}
      <div className="mb-4 flex items-center justify-between">
        <Button
          aria-label="Previous years"
          className="size-(--cell-size) select-none p-0"
          disabled={!canGoPrevious || disabled === true}
          onClick={handlePreviousPage}
          size="icon"
          variant="ghost"
        >
          <ChevronLeftIcon className="size-4" />
        </Button>

        <div className="select-none font-medium text-sm">
          {startYear} - {endYear}
        </div>

        <Button
          aria-label="Next years"
          className="size-(--cell-size) select-none p-0"
          disabled={!canGoNext || disabled === true}
          onClick={handleNextPage}
          size="icon"
          variant="ghost"
        >
          <ChevronRightIcon className="size-4" />
        </Button>
      </div>

      {/* 年份网格 */}
      <div className="grid grid-cols-4 gap-2">
        {years.map((year) => {
          const isSelected = year === selectedYear;
          const isCurrent = year === currentYear;
          const isDisabled = isYearDisabled(year);

          return (
            <Button
              className={cn(
                "h-10 select-none font-normal",
                isSelected &&
                  "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
                isCurrent && !isSelected && "bg-accent text-accent-foreground",
                isDisabled && "cursor-not-allowed opacity-50"
              )}
              disabled={isDisabled || disabled === true}
              key={year}
              onClick={() => handleYearClick(year)}
              size="sm"
              variant="ghost"
            >
              {year}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
