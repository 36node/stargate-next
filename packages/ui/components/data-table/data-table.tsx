"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/shadcn/table";
import { useControl } from "@repo/ui/hooks/use-control";
import { cn } from "@repo/ui/lib/utils";
import {
  type ColumnDef,
  type ColumnFiltersState,
  getFacetedUniqueValues as clientGetFacetedUniqueValues,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getFacetedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type PaginationState,
  type RowData,
  type SortingState,
  type TableMeta,
  type Table as TableType,
  useReactTable,
  type VisibilityState,
} from "@tanstack/react-table";
import { SquareMinus, SquarePlus } from "lucide-react";
import { useEffect, useState } from "react";

import { DataTablePagination } from "./data-table-pagination";

const DefaultPageSize = 10;
const DEFAULT_EMPTY_CELL_TEXT = "--";

/**
 * 判断单元格值是否为空
 * - null / undefined / 空字符串视为空
 * - 0 和 false 是有意义的数据，不视为空
 */
function isCellEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === "";
}

const DefaultLargePageSize = 10_000;

export type WithChildren<TData> = TData & { children?: WithChildren<TData>[] };

type DataTableProps<TData, TValue = unknown> = {
  columns: ColumnDef<WithChildren<TData>, TValue>[];
  data: WithChildren<TData>[];
  enableRowSelection?: boolean;
  toolbarComponent?: React.ComponentType<DataTableToolbarProps<TData>>;

  // Manual modes
  manualPagination?: boolean;
  manualFiltering?: boolean;
  manualSorting?: boolean;

  // Row count for manual pagination
  rowCount?: number;

  // Pagination
  pagination?: PaginationState;
  defaultPagination?: PaginationState;
  onPaginationChange?: (
    updater: PaginationState | ((old: PaginationState) => PaginationState)
  ) => void;

  // Column Filters
  columnFilters?: ColumnFiltersState;
  defaultColumnFilters?: ColumnFiltersState;
  onColumnFiltersChange?: (
    updater:
      | ColumnFiltersState
      | ((old: ColumnFiltersState) => ColumnFiltersState)
  ) => void;

  //Global Filter
  globalFilter?: string;
  onGlobalFilterChange?: (value: string | undefined) => void;

  // Sorting
  sorting?: SortingState;
  defaultSorting?: SortingState;
  onSortingChange?: (
    updater: SortingState | ((old: SortingState) => SortingState)
  ) => void;

  // Column Visibility
  columnVisibility?: VisibilityState;
  defaultColumnVisibility?: VisibilityState;
  onColumnVisibilityChange?: (
    updater: VisibilityState | ((old: VisibilityState) => VisibilityState)
  ) => void;

  // 统计
  getFacetedUniqueValues?: <TTableData extends RowData>() => (
    table: TableType<WithChildren<TTableData>>,
    columnId: string
  ) => () => Map<unknown, number>;

  hidePagination?: boolean;
  className?: string;
  meta?: TableMeta<WithChildren<TData>>;

  // 其他属性
  pending?: boolean;
  /** 手动刷新回调（来自 useDataTableSearch，挂到 table.meta 供 DataTableRefresh 调用） */
  refresh?: () => void;
  emptyDesc?: React.ReactNode;
  /** 如果为 true，初始时展开所有行（默认折叠） */
  defaultExpandAll?: boolean;
  /** 在第一列显示树形展开/折叠图标（需数据含 children） */
  showTreeToggle?: boolean;
  /** 启用 table-layout: fixed，列宽由 meta.width 严格控制，未设宽度的列均分剩余空间 */
  tableFixed?: boolean;
  /**
   * 全局空值占位符
   * 当单元格值为 null / undefined / 空字符串时显示此文本，以浅色（muted）样式呈现。
   * - 0 和 false 等有意义的值不会被视为空值
   * - 仅对有 accessor 的数据列生效，display 列（如操作列）不受影响
   * - 可在列 meta.emptyCellText 中按列覆盖或关闭
   * @default "--"
   */
  emptyCellText?: React.ReactNode;
};

// 定义 DataTableToolbarProps 接口
type DataTableToolbarProps<TData> = {
  table: TableType<WithChildren<TData>> | TableType<TData>;
};

/**
 * 渲染树形展开按钮
 */
function TreeToggleButton({
  canExpand,
  isExpanded,
  onToggle,
}: {
  canExpand: boolean;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  if (!canExpand) {
    return <span className="inline-block h-5 w-5" />;
  }

  return (
    <button
      aria-label={isExpanded ? "折叠" : "展开"}
      className="inline-flex h-5 w-5 items-center justify-center text-muted-foreground"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      type="button"
    >
      {isExpanded ? (
        <SquareMinus className="h-4 w-4" />
      ) : (
        <SquarePlus className="h-4 w-4" />
      )}
    </button>
  );
}

export function DataTable<TData, TValue = unknown>({
  columns,
  data,
  enableRowSelection,
  toolbarComponent: DataTableToolbar,

  // Manual modes
  manualPagination = false,
  manualFiltering = false,
  manualSorting = false,

  // Row count for manual pagination
  rowCount,

  // Pagination
  pagination: controlledPagination,
  defaultPagination,
  onPaginationChange,

  // Column Filters
  columnFilters: controlledColumnFilters,
  defaultColumnFilters,
  onColumnFiltersChange,

  // Global Filter
  globalFilter: controlledGlobalFilter,
  onGlobalFilterChange,

  // Sorting
  sorting: controlledSorting,
  defaultSorting,
  onSortingChange,

  // Column Visibility
  columnVisibility: controlledColumnVisibility,
  defaultColumnVisibility,
  onColumnVisibilityChange,

  // 统计
  getFacetedUniqueValues = clientGetFacetedUniqueValues,

  hidePagination,
  className,
  meta,
  emptyDesc = "暂无数据",
  emptyCellText = DEFAULT_EMPTY_CELL_TEXT,

  pending,
  refresh,
  defaultExpandAll = false,
  showTreeToggle = false,
  tableFixed = false,
}: DataTableProps<TData, TValue>) {
  const [rowSelection, setRowSelection] = useState({});

  // metaPending: 预留给外部通过 table.options.meta.setPending 手动控制
  // pending prop: 由 useDataTableSearch 的 URL transition 控制（分页/筛选/排序/刷新共用）
  // 两者取 OR，任一为 true 都显示遮罩
  const [metaPending, setMetaPending] = useState(false);
  const pendingState = (pending ?? false) || metaPending;

  // 使用 useControl 来处理受控和非受控状态
  const [pagination, setPagination] = useControl(
    defaultPagination ?? {
      pageIndex: 0,
      pageSize: hidePagination ? DefaultLargePageSize : DefaultPageSize,
    },
    controlledPagination,
    onPaginationChange
  );

  const [columnFilters, setColumnFilters] = useControl(
    defaultColumnFilters || [],
    controlledColumnFilters,
    onColumnFiltersChange
  );

  // Global filter 支持（受控/非受控）
  const [globalFilter, setGlobalFilter] = useControl<string | undefined>(
    undefined,
    controlledGlobalFilter,
    onGlobalFilterChange
  );

  const [sorting, setSorting] = useControl(
    defaultSorting || [],
    controlledSorting,
    onSortingChange
  );

  const [columnVisibility, setColumnVisibility] = useControl(
    defaultColumnVisibility || {},
    controlledColumnVisibility,
    onColumnVisibilityChange
  );

  const table = useReactTable({
    data,
    columns,
    meta: {
      pending: pendingState,
      setPending: setMetaPending,
      refresh,
      ...meta,
    },
    rowCount,
    state: {
      columnFilters,
      columnVisibility,
      rowSelection,
      sorting,
      pagination,
      globalFilter,
    },
    enableRowSelection,
    manualPagination,
    manualFiltering,
    manualSorting,
    getSubRows: (row) => row.children,
    getExpandedRowModel: getExpandedRowModel(),
    onPaginationChange: setPagination,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: "includesString",
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: manualFiltering ? undefined : getFilteredRowModel(),
    getPaginationRowModel: manualPagination
      ? undefined
      : getPaginationRowModel(),
    getSortedRowModel: manualSorting ? undefined : getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  });

  // 如果需要默认展开所有行（例如用于测试或展示树形数据），在 data 变化时触发展开
  useEffect(() => {
    if (defaultExpandAll) {
      table.toggleAllRowsExpanded(true);
    }
  }, [defaultExpandAll, table]);

  return (
    <div className="space-y-4">
      {DataTableToolbar && <DataTableToolbar table={table} />}
      <div
        className={cn(
          "relative overflow-hidden rounded-md border bg-card",
          className
        )}
      >
        {pendingState && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/50 backdrop-blur-sm">
            <div className="flex items-center space-x-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-primary" />
              <span className="text-muted-foreground text-sm">加载中...</span>
            </div>
          </div>
        )}
        <Table className={cn(tableFixed && "table-fixed")}>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    className="px-3"
                    colSpan={header.colSpan}
                    key={header.id}
                    style={
                      header.column.columnDef.meta?.width
                        ? { width: header.column.columnDef.meta.width }
                        : undefined
                    }
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => {
                const cells = row.getVisibleCells();
                const depth = row.depth ?? 0;
                const canExpand = row.getCanExpand();
                const isExpanded = row.getIsExpanded();

                return (
                  <TableRow
                    data-state={row.getIsSelected() && "selected"}
                    key={row.id}
                  >
                    {cells.map((cell, idx) => {
                      const columnMeta = cell.column.columnDef.meta;

                      // 空值占位符：仅对 accessor 列生效（排除 display 列如操作列）
                      const columnEmptyText = columnMeta?.emptyCellText;
                      const isAccessorColumn = !!cell.column.accessorFn;
                      const shouldShowPlaceholder =
                        columnEmptyText !== false &&
                        isAccessorColumn &&
                        isCellEmpty(cell.getValue());

                      // 渲染单元格内容（或空值占位符）
                      const renderCellContent = () => {
                        if (shouldShowPlaceholder) {
                          const placeholder =
                            typeof columnEmptyText === "string"
                              ? columnEmptyText
                              : (emptyCellText ?? DEFAULT_EMPTY_CELL_TEXT);
                          return (
                            <span className="text-muted-foreground/60">
                              {placeholder}
                            </span>
                          );
                        }
                        return flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        );
                      };

                      // 如果启用了树形切换，则在第一列渲染图标与缩进
                      if (idx === 0 && showTreeToggle) {
                        return (
                          <TableCell className="px-3 py-1" key={cell.id}>
                            <div className="flex min-h-8 items-center">
                              <div className="flex items-center">
                                <div
                                  style={{
                                    width: 28,
                                    display: "flex",
                                    justifyContent: "center",
                                    marginLeft: depth * 6,
                                  }}
                                >
                                  <TreeToggleButton
                                    canExpand={canExpand}
                                    isExpanded={isExpanded}
                                    onToggle={() => row.toggleExpanded()}
                                  />
                                </div>

                                <div
                                  className={cn("ml-0", {
                                    "text-foreground": depth === 0 && canExpand,
                                    "text-muted-foreground": depth > 0,
                                  })}
                                >
                                  {renderCellContent()}
                                </div>
                              </div>
                            </div>
                          </TableCell>
                        );
                      }

                      const cellValue = cell.getValue();
                      const highlight =
                        depth === 0 &&
                        canExpand &&
                        typeof cellValue === "number" &&
                        cellValue > 0;
                      const isChild = depth > 0;

                      return (
                        <TableCell className="px-3 py-1" key={cell.id}>
                          <div
                            className={cn("flex min-h-8 items-center", {
                              "text-foreground": highlight,
                              "text-muted-foreground": isChild,
                            })}
                          >
                            {renderCellContent()}
                          </div>
                        </TableCell>
                      );
                    })}
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell
                  className="h-24 text-center"
                  colSpan={columns.length}
                >
                  {emptyDesc}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {!hidePagination && <DataTablePagination table={table} />}
    </div>
  );
}
