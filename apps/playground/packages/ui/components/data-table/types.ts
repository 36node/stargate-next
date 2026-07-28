import type { RowData } from "@tanstack/react-table";

// 扩展 TanStack Table 的类型
declare module "@tanstack/react-table" {
  // biome-ignore lint: Interface and type params required for module augmentation
  interface ColumnMeta<TData extends RowData, TValue> {
    /** 列显示名称 */
    displayName?: string;
    /** 列宽度 */
    width?: number;
    /** 是否可导入 */
    unimportable?: boolean;
    /** 是否可导出 */
    unexportable?: boolean;
    /**
     * 列级空值占位符配置
     * - string：覆盖全局占位符（如 "N/A"）
     * - false：禁用该列的空值占位符
     * - undefined（默认）：使用全局 emptyCellText
     */
    emptyCellText?: string | false;
  }

  // biome-ignore lint: Interface required for module augmentation
  interface TableMeta<TData extends RowData> {
    /** 表格是否处于 pending 状态 */
    pending?: boolean;
    /** 设置表格 pending 状态 */
    setPending?: (value: boolean) => void;
    /** 手动刷新（复用 useSearch 的 startTransition，触发表格 loading 遮罩） */
    refresh?: () => void;
  }
}

/**
 * 基础查询参数类型
 * @template G - 分组字段名
 */
export type Query<T extends Record<string, unknown> = Record<string, unknown>> =
  {
    sort?: string;
    size?: number;
    page?: number;
  } & T;

/**
 * 我们的列定义
 */
export type DataTableHeader = {
  /** 列头显示名称 */
  title: string;
  /** 数据字段 key */
  key?: string;
  /** 列宽度 */
  width?: number;
  /** 列合并数(colspan),默认为 1 */
  colSpan?: number;
  /** 表头所在层级(0-based),用于多层表头 */
  depth?: number;
  /** 空表头 */
  isPlaceholder?: boolean;
};
