/**
 * Excel 列定义
 */
export type XlsxColumn = {
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

/**
 * 分页查询结果
 */
export type FetchDataResult<T = Record<string, unknown>> = {
  /** 数据列表 */
  rows: T[];
  /** 总数量 */
  total: number;
};

/**
 * 获取数据的函数类型（闭包模式）
 *
 * 先用 query 初始化（如获取 total），再返回按页取数据的函数。
 * page 从 0 开始。
 *
 * 支持两种模式：
 * 1. 返回 Promise（异步初始化，如提前获取 total）
 * 2. 返回同步函数（简单场景）
 */
export type FetchDataCreator<
  // biome-ignore lint/suspicious/noExplicitAny: generic defaults need any
  Query extends Record<string, any> = Record<string, any>,
  // biome-ignore lint/suspicious/noExplicitAny: generic defaults need any
  T = any,
> = (
  query?: Query
) =>
  | Promise<(page: number) => Promise<FetchDataResult<T>>>
  | ((page: number) => Promise<FetchDataResult<T>>);

/**
 * 客户端请求参数（单 sheet）
 */
export type ExportRequestBody<
  // biome-ignore lint/suspicious/noExplicitAny: generic defaults need any
  Query extends Record<string, any> = Record<string, any>,
> = {
  /** 查询条件 */
  query?: Query;
  /** 列配置 */
  header: XlsxColumn[][];
  /** 文件名（移动端 prepare 模式使用） */
  filename?: string;
};

/**
 * 移动端 token 存储载荷
 */
export type ExportTokenPayload<
  // biome-ignore lint/suspicious/noExplicitAny: generic defaults need any
  Query extends Record<string, any> = Record<string, any>,
> = {
  query?: Query;
  header: XlsxColumn[][];
  filename?: string;
};

/**
 * 创建导出 Handler 的配置
 */
export type CreateExportHandlerOptions<
  // biome-ignore lint/suspicious/noExplicitAny: generic defaults need any
  Query extends Record<string, any> = Record<string, any>,
  // biome-ignore lint/suspicious/noExplicitAny: generic defaults need any
  T = any,
> = {
  /** 获取数据的函数创建器（闭包） */
  fetchCreator: FetchDataCreator<Query, T>;
  /** 默认 sheet name */
  sheetName?: string;
  /** 权限校验（可选，预留） */
  permission?: string;
};

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

/**
 * SSE 进度事件类型
 */
export type ImportProgressEvent =
  | { type: "info"; progress?: number; message: string }
  | {
      type: "error";
      message: string;
      details?: Array<{ message: string }>;
    }
  | {
      type: "success";
      progress?: number;
      message: string;
      // biome-ignore lint/suspicious/noExplicitAny: generic import result
      data?: any;
    }
  | {
      type: "partial";
      progress?: number;
      message: string;
      // biome-ignore lint/suspicious/noExplicitAny: generic import result
      data?: any;
      details?: Array<{ message: string }>;
    };

/**
 * 导入数据处理器（两阶段流式架构）
 *
 * **Phase 1 — Scan**（可选）：流式读取 Excel，逐行调用 `scan` 收集约束列值到业务自管的 Set/Map 中，
 * 然后调用 `preCheck` 做批量数据库查询。此阶段结束后文件数据可完整释放。
 *
 * **Phase 2 — Process**：再次流式读取同一文件，逐行 `transform` + schema 校验，攒够一批后调用 `process` 写入数据库。
 * 每批写入后立即释放，内存始终只保持一批数据。
 *
 * 若未定义 `scan`，则退化为单遍模式（与之前行为一致）。
 */
// biome-ignore lint/suspicious/noExplicitAny: generic processor
export type ImportProcessor<T = any, BatchSize extends number = number> = {
  /**
   * 扫描钩子（可选）。第一遍流式读取时逐行调用。
   * 业务代码在此提取约束列值到自管的 Set/Map 中，用于后续 preCheck。
   * 抛异常可中断导入（如批内去重发现重复）。
   *
   * @param row - Excel 原始行数据（与 transform 入参相同）
   * @param rowNumber - 对应的 Excel 行号（用于错误提示）
   */
  scan?: (
    // biome-ignore lint/suspicious/noExplicitAny: excel row data is untyped
    row: any,
    rowNumber: number
  ) => Array<{ message: string }> | undefined;
  /**
   * 预检查（可选）。扫描通过后调用。
   * 返回错误列表，由 import handler 统一抛错。
   */
  preCheck?: (ctx: {
    maxErrors: number;
  }) =>
    | Promise<Array<{ message: string }> | undefined>
    | Array<{ message: string }>
    | undefined;
  /** 将 Excel 原始行转换为目标格式，校验失败时抛异常 */
  // biome-ignore lint/suspicious/noExplicitAny: excel row data is untyped
  transform: (row: any) => T | Promise<T>;
  /** 将已转换的数据写入数据库。batchSize = 1 时接收 T，> 1 时接收 T[] */
  process: (data: BatchSize extends 1 ? T : T[]) => void | Promise<void>;
};

/**
 * 导入数据处理器工厂函数
 *
 * @param extraData - 客户端通过 FormData 附带的额外字段（如 campaignId 等）
 */
export type ImportProcessorCreator<
  // biome-ignore lint/suspicious/noExplicitAny: generic processor creator
  T = any,
  BatchSize extends number = number,
> = (
  extraData: Record<string, string>
) => ImportProcessor<T, BatchSize> | Promise<ImportProcessor<T, BatchSize>>;

/**
 * 创建导入 Handler 的配置
 */
export type CreateImportHandlerOptions<
  // biome-ignore lint/suspicious/noExplicitAny: generic defaults need any
  T = any,
  BatchSize extends number = number,
> = {
  /** 数据处理器工厂函数 */
  processorCreator: ImportProcessorCreator<T, BatchSize>;
  /**
   * 批量处理的批次大小（默认 1）
   * - 1：调用 process(data: T)
   * - > 1：调用 process(data: T[])
   */
  batchSize?: BatchSize;
  /** 默认工作表名称（默认 'Sheet1'） */
  sheetName?: string;
  /** 权限校验（可选，预留） */
  permission?: string;
  /** 导入数据校验 schema（可选） */
  schema?: { safeParse: (data: unknown) => SafeParseResult };
  /**
   * process 出错时的策略（默认 "abort"）
   * - "abort"：遇错即停，已成功的数据保留
   * - "skip"：跳过错误行继续导入，最终汇总成功/失败数 + 失败明细
   */
  onError?: "abort" | "skip";
  /**
   * 最大错误数（默认 10）
   * scan/process 阶段累计错误达到上限后会提前停止。
   */
  maxErrors?: number;
};

/** safeParse 返回值（兼容 Zod 3/4） */
export type SafeParseResult =
  | { success: true; data: unknown }
  | {
      success: false;
      error: {
        flatten: () => { fieldErrors: Record<string, string[] | undefined> };
      };
    };

/**
 * 导入流程中的结构化错误
 *
 * 替代 `throw { message, details }` 普通对象，满足 Biome useThrowOnlyError 规则。
 */
export class ImportError extends Error {
  details?: Array<{ message: string }>;

  constructor(message: string, details?: Array<{ message: string }>) {
    super(message);
    this.name = "ImportError";
    this.details = details;
  }
}
