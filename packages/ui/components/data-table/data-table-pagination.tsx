"use client";

import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@repo/ui/components/shadcn/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/shadcn/select";
import type { Table } from "@tanstack/react-table";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { generatePaginationRange } from "./helper";

const PAGE_SIZE_OPTIONS = [10, 20, 30, 50, 100];

type DataTablePaginationProps<TData> = {
  table: Table<TData>;
};

const ELLIPSIS_JUMP_PAGES = 5;

/**
 * 处理省略号点击事件
 * @param currentPage 当前页码 (0-based)
 * @param totalPages 总页数
 * @param direction 方向：'left' 表示左侧省略号，'right' 表示右侧省略号
 * @returns 目标页码 (0-based)
 */
function handleEllipsisClick(
  currentPage: number,
  totalPages: number,
  direction: "left" | "right"
): number {
  if (direction === "left") {
    return Math.max(0, currentPage - ELLIPSIS_JUMP_PAGES);
  }
  // 未知总页数时，直接向前跳转
  if (totalPages < 0) {
    return currentPage + ELLIPSIS_JUMP_PAGES;
  }
  // 已知总页数时，确保不超过最后一页
  return Math.min(totalPages - 1, currentPage + ELLIPSIS_JUMP_PAGES);
}

/**
 * 根据实际跳转目标生成智能提示文字
 */
function getEllipsisTitle(
  currentPage: number,
  totalPages: number,
  direction: "left" | "right"
): string {
  const targetPage = handleEllipsisClick(currentPage, totalPages, direction);
  if (targetPage === 0) {
    return "跳至首页";
  }
  if (totalPages > 0 && targetPage === totalPages - 1) {
    return `跳至末页（第 ${totalPages} 页）`;
  }
  return `跳至第 ${targetPage + 1} 页`;
}

export function DataTablePagination<TData>({
  table,
}: DataTablePaginationProps<TData>) {
  const currentPage = table.getState().pagination.pageIndex ?? 0;
  const totalPages = table.getPageCount();
  const size = table.getState().pagination.pageSize;
  const total = table.getRowCount();
  const selectedRows = table.getFilteredSelectedRowModel().rows.length;

  // 生成智能分页范围
  const paginationRange = generatePaginationRange(currentPage, totalPages);

  // 处理省略号点击
  const handleEllipsisClickLocal = (direction: "left" | "right") => {
    const targetPage = handleEllipsisClick(currentPage, totalPages, direction);
    table.setPageIndex(targetPage);
  };

  return (
    <div className="flex items-center justify-between">
      <div className="font-medium text-muted-foreground text-sm">
        共 {total} 条{selectedRows > 0 && `, ${selectedRows} 被选中`}
      </div>
      <div className="flex items-center gap-6">
        {/* 页面大小选择器 */}
        <div className="hidden items-center gap-2 font-medium lg:flex">
          <span className="shrink-0 whitespace-nowrap text-sm">每页</span>
          <Select
            onValueChange={(val: string) => {
              table.setPageSize(Number(val));
            }}
            value={`${size}`}
          >
            <SelectTrigger className="h-8! w-fit text-sm focus-visible:border-input focus-visible:ring-0">
              <SelectValue placeholder={`${size}`} />
            </SelectTrigger>
            <SelectContent side="top">
              {PAGE_SIZE_OPTIONS.map((pageSize) => (
                <SelectItem key={pageSize} value={`${pageSize}`}>
                  {pageSize}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="whitespace-nowrap text-sm">条</span>
        </div>

        <Pagination>
          <PaginationContent>
            {/* 上一页按钮 */}
            <PaginationItem>
              <PaginationPrevious
                className={`h-8 px-3 ${table.getCanPreviousPage() ? "cursor-pointer" : "pointer-events-none opacity-50"}`}
                onClick={(e: React.MouseEvent) => {
                  e.preventDefault();
                  if (!table.getCanPreviousPage()) {
                    return;
                  }
                  table.previousPage();
                }}
              >
                <ChevronLeftIcon className="h-4 w-4" />
                <span className="sr-only sm:not-sr-only sm:ml-2">上一页</span>
              </PaginationPrevious>
            </PaginationItem>

            {/* 页码数字和省略号 */}
            {paginationRange.map((pageNumber, index) => {
              if (pageNumber === "ellipsis") {
                // 判断是左侧还是右侧省略号
                const isLeftEllipsis = index < paginationRange.length / 2;
                return (
                  <PaginationItem
                    key={`ellipsis-${isLeftEllipsis ? "left" : "right"}`}
                  >
                    <PaginationEllipsis
                      className="hidden cursor-pointer hover:bg-accent md:inline-flex"
                      onClick={() =>
                        handleEllipsisClickLocal(
                          isLeftEllipsis ? "left" : "right"
                        )
                      }
                      title={getEllipsisTitle(
                        currentPage,
                        totalPages,
                        isLeftEllipsis ? "left" : "right"
                      )}
                    />
                  </PaginationItem>
                );
              }

              return (
                <PaginationItem key={pageNumber}>
                  <PaginationLink
                    className="hidden cursor-pointer md:inline-flex"
                    isActive={pageNumber === currentPage}
                    onClick={(e: React.MouseEvent) => {
                      e.preventDefault();
                      if (pageNumber !== currentPage) {
                        table.setPageIndex(pageNumber);
                      }
                    }}
                    size="sm"
                  >
                    {pageNumber + 1}
                  </PaginationLink>
                </PaginationItem>
              );
            })}

            {/* 下一页按钮 */}
            <PaginationItem>
              <PaginationNext
                className={`h-8 px-3 ${table.getCanNextPage() ? "cursor-pointer" : "pointer-events-none opacity-50"}`}
                onClick={(e: React.MouseEvent) => {
                  e.preventDefault();
                  if (!table.getCanNextPage()) {
                    return;
                  }
                  table.nextPage();
                }}
              >
                <span className="sr-only sm:not-sr-only sm:mr-2">下一页</span>
                <ChevronRightIcon className="h-4 w-4" />
              </PaginationNext>
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    </div>
  );
}
