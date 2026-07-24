import type { Worksheet } from "exceljs";

import type {
  CreateImportHandlerOptions,
  ImportProcessor,
  ImportProgressEvent,
  XlsxColumn,
} from "./types";
import { ImportError } from "./types";
import { iterateWorksheetRows, loadWorksheet, writeExcel } from "./utils";

// ---------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------

async function retryRowByRow<T>(
  rows: T[],
  rowNumbers: number[],
  processSingle: (row: T) => void | Promise<void>,
  abortOnFirst?: boolean
): Promise<{ successCount: number; errors: Array<{ message: string }> }> {
  let successCount = 0;
  const errors: Array<{ message: string }> = [];

  for (let i = 0; i < rows.length; i++) {
    try {
      await Promise.resolve(processSingle(rows[i]));
      successCount += 1;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "写入失败";
      errors.push({ message: `第 ${rowNumbers[i]} 行: ${msg}` });
      if (abortOnFirst) {
        break;
      }
    }
  }

  return { successCount, errors };
}

type BatchErrorContext<T, BatchSize extends number> = {
  batchRows: T[];
  batchRowNums: number[];
  errorMessage: string;
  onError: "abort" | "skip";
  processor: ImportProcessor<T, BatchSize>;
  prevSuccessCount: number;
};

async function handleBatchError<T, BatchSize extends number>(
  ctx: BatchErrorContext<T, BatchSize>
): Promise<{ successCount: number; errors: Array<{ message: string }> }> {
  const { batchRows, batchRowNums, errorMessage, onError, processor } = ctx;

  if (batchRows.length === 1) {
    if (onError === "abort") {
      throw new ImportError(
        `导入中断：第 ${batchRowNums[0]} 行 ${errorMessage}`,
        [
          {
            message: `已成功导入 ${ctx.prevSuccessCount} 条，第 ${batchRowNums[0]} 行出错后停止`,
          },
        ]
      );
    }
    return {
      successCount: 0,
      errors: [{ message: `第 ${batchRowNums[0]} 行: ${errorMessage}` }],
    };
  }

  const retrySingle = (row: T) =>
    processor.process([row] as unknown as BatchSize extends 1 ? T : T[]);

  const retry = await retryRowByRow(
    batchRows,
    batchRowNums,
    retrySingle,
    onError === "abort"
  );

  if (onError === "abort" && retry.errors.length > 0) {
    const total = ctx.prevSuccessCount + retry.successCount;
    throw new ImportError(`导入中断：${retry.errors[0].message}`, [
      { message: `已成功导入 ${total} 条，出错后停止` },
    ]);
  }

  return retry;
}

// ---------------------------------------------------------------------------
// Transform helpers
// ---------------------------------------------------------------------------

type TransformRowOpts<T> = {
  // biome-ignore lint/suspicious/noExplicitAny: excel row data is untyped
  rawRow: any;
  rowNumber: number;
  // biome-ignore lint/suspicious/noExplicitAny: excel row data is untyped
  transform: (row: any) => T | Promise<T>;
  schema: CreateImportHandlerOptions["schema"];
  header: XlsxColumn[][];
};

async function applyTransform<T>(opts: TransformRowOpts<T>): Promise<T> {
  try {
    return await Promise.resolve(opts.transform(opts.rawRow));
  } catch (error: unknown) {
    const err = error as {
      message?: string;
      details?: Array<{ message: string }>;
    };
    if (err.details && Array.isArray(err.details)) {
      throw new ImportError(
        err.message || "数据转换失败！",
        err.details.map((d) => ({
          message: `第 ${opts.rowNumber} 行: ${d.message}`,
        }))
      );
    }
    throw new ImportError("数据转换失败！", [
      {
        message: `第 ${opts.rowNumber} 行: ${(error as Error).message || "数据转换失败"}`,
      },
    ]);
  }
}

function applySchema<T>(
  transformed: T,
  rowNumber: number,
  schema: CreateImportHandlerOptions["schema"],
  header: XlsxColumn[][]
): T {
  if (!schema) {
    return transformed;
  }
  const result = schema.safeParse(transformed);
  if (!result.success) {
    const rowHeader = header.at(-1) ?? [];
    const details = Object.entries(result.error.flatten().fieldErrors).map(
      ([field, messages]) => {
        const msg = Array.isArray(messages)
          ? messages.join("|")
          : "数据格式错误";
        const title =
          rowHeader.find((col) => col.key === field)?.title || field;
        return { message: `文件第${rowNumber}行 ${title}: ${msg}` };
      }
    );
    throw new ImportError("检查错误！", details);
  }
  return (result.data ?? transformed) as T;
}

async function transformRow<T>(opts: TransformRowOpts<T>): Promise<T> {
  const transformed = await applyTransform(opts);
  return applySchema(transformed, opts.rowNumber, opts.schema, opts.header);
}

// ---------------------------------------------------------------------------
// Scan pass (Phase 1)
// ---------------------------------------------------------------------------

function runScanPass(
  worksheet: Worksheet,
  header: XlsxColumn[][],
  scan: (
    // biome-ignore lint/suspicious/noExplicitAny: excel row data is untyped
    row: any,
    rowNumber: number
  ) => Array<{ message: string }> | undefined,
  maxErrors: number
): {
  totalRows: number;
  errors: Array<{ message: string }>;
} {
  let totalRows = 0;
  const errors: Array<{ message: string }> = [];

  for (const { row, rowNumber } of iterateWorksheetRows(worksheet, header)) {
    const rowErrors = scan(row, rowNumber) ?? [];
    if (rowErrors.length > 0) {
      const remaining = maxErrors - errors.length;
      if (remaining > 0) {
        errors.push(...rowErrors.slice(0, remaining));
      }
    }
    totalRows += 1;

    if (errors.length >= maxErrors) {
      break;
    }
  }
  return { totalRows, errors };
}

// ---------------------------------------------------------------------------
// Process pass (Phase 2 / unified batch-write logic)
// ---------------------------------------------------------------------------

type ProcessPassOptions<T, BatchSize extends number> = {
  worksheet: Worksheet;
  header: XlsxColumn[][];
  processor: ImportProcessor<T, BatchSize>;
  schema: CreateImportHandlerOptions["schema"];
  batchSize: BatchSize;
  onError: "abort" | "skip";
  maxErrors: number;
  totalRows: number;
  sendEvent: (event: ImportProgressEvent) => void;
};

async function runProcessPass<T, BatchSize extends number>(
  opts: ProcessPassOptions<T, BatchSize>
): Promise<void> {
  const {
    worksheet,
    header,
    processor,
    schema,
    batchSize,
    onError,
    maxErrors,
    totalRows,
    sendEvent,
  } = opts;

  let successCount = 0;
  let processedRows = 0;
  const errors: Array<{ message: string }> = [];
  let maxErrorsReached = false;
  let batch: T[] = [];
  let batchRowNumbers: number[] = [];

  const pushErrors = (incoming: Array<{ message: string }>) => {
    if (incoming.length === 0 || maxErrorsReached) {
      return;
    }

    const remaining = maxErrors - errors.length;
    if (remaining > 0) {
      errors.push(...incoming.slice(0, remaining));
    }
    if (errors.length >= maxErrors) {
      maxErrorsReached = true;
    }
  };

  const flushBatch = async () => {
    if (batch.length === 0) {
      return;
    }
    const currentBatch = batch;
    const currentRowNums = batchRowNumbers;
    batch = [];
    batchRowNumbers = [];

    const data =
      batchSize > 1
        ? currentBatch
        : (currentBatch[0] as BatchSize extends 1 ? T : T[]);

    try {
      await Promise.resolve(
        processor.process(data as BatchSize extends 1 ? T : T[])
      );
      successCount += currentBatch.length;
    } catch (processError: unknown) {
      const msg =
        processError instanceof Error ? processError.message : "写入失败";
      const retry = await handleBatchError({
        batchRows: currentBatch,
        batchRowNums: currentRowNums,
        errorMessage: msg,
        onError,
        processor,
        prevSuccessCount: successCount,
      });
      successCount += retry.successCount;
      pushErrors(retry.errors);
    }

    sendEvent({
      type: "info",
      progress: Math.floor((processedRows / totalRows) * 100),
      message: `已导入 ${successCount} / ${totalRows} 条数据...`,
    });
  };

  for (const { row: rawRow, rowNumber } of iterateWorksheetRows(
    worksheet,
    header
  )) {
    const transformed = await transformRow<T>({
      rawRow,
      rowNumber,
      transform: processor.transform,
      schema,
      header,
    });
    batch.push(transformed);
    batchRowNumbers.push(rowNumber);
    processedRows += 1;

    if (batch.length >= batchSize) {
      await flushBatch();
      if (maxErrorsReached) {
        break;
      }
    }
  }

  if (!maxErrorsReached) {
    await flushBatch();
  }

  if (processedRows === 0) {
    throw new ImportError("空数据，请确认");
  }

  if (errors.length > 0) {
    const partialMessage = maxErrorsReached
      ? `导入提前结束：达到最大错误数 ${maxErrors} 条，成功 ${successCount} 条，失败 ${errors.length} 条`
      : `导入完成：成功 ${successCount} 条，失败 ${errors.length} 条`;
    sendEvent({
      type: "partial",
      progress: 100,
      message: partialMessage,
      data: { count: successCount, failed: errors.length },
      details: errors,
    });
  } else {
    sendEvent({
      type: "success",
      progress: 100,
      message: `导入完成：成功 ${successCount} 条`,
      data: { count: successCount },
    });
  }
}

// ---------------------------------------------------------------------------
// Orchestration: two-pass (scan → preCheck → process) or single-pass
// ---------------------------------------------------------------------------

type ImportRunOptions<T, BatchSize extends number> = {
  worksheet: Worksheet;
  header: XlsxColumn[][];
  processor: ImportProcessor<T, BatchSize>;
  schema: CreateImportHandlerOptions["schema"];
  batchSize: BatchSize;
  onError: "abort" | "skip";
  maxErrors: number;
  sendEvent: (event: ImportProgressEvent) => void;
};

async function runImport<T, BatchSize extends number>(
  opts: ImportRunOptions<T, BatchSize>
): Promise<void> {
  const { worksheet, header, processor, sendEvent, ...rest } = opts;

  let totalRows: number;

  const validateNoError = (
    validationErrors: Array<{ message: string }> | undefined,
    maxErrors: number
  ) => {
    if (!validationErrors || validationErrors.length === 0) {
      return;
    }
    const summary =
      validationErrors.length >= maxErrors
        ? `检查错误过多，达到上限 ${maxErrors} 条，已停止检查`
        : `检查错误！共 ${validationErrors.length} 条`;
    throw new ImportError(summary, [...validationErrors]);
  };

  if (processor.scan) {
    sendEvent({ type: "info", message: "正在扫描数据..." });
    const scanResult = runScanPass(
      worksheet,
      header,
      processor.scan as NonNullable<typeof processor.scan>,
      rest.maxErrors
    );
    ({ totalRows } = scanResult);

    if (totalRows === 0) {
      throw new ImportError("空数据，请确认");
    }

    validateNoError(scanResult.errors, rest.maxErrors);

    if (processor.preCheck) {
      sendEvent({ type: "info", message: "正在预检查数据约束..." });
      const preCheckErrors = await Promise.resolve(
        processor.preCheck({ maxErrors: rest.maxErrors })
      );
      validateNoError(preCheckErrors, rest.maxErrors);
    }

    sendEvent({
      type: "info",
      message: `校验通过，准备导入 ${totalRows} 条数据...`,
    });
  } else {
    totalRows = countWorksheetRows(worksheet, header);
    if (totalRows === 0) {
      throw new ImportError("空数据，请确认");
    }

    if (processor.preCheck) {
      sendEvent({ type: "info", message: "正在预检查数据约束..." });
      const preCheckErrors = await Promise.resolve(
        processor.preCheck({ maxErrors: rest.maxErrors })
      );
      validateNoError(preCheckErrors, rest.maxErrors);
    }
  }

  await runProcessPass({
    worksheet,
    header,
    processor,
    ...rest,
    totalRows,
    sendEvent,
  });
}

function countWorksheetRows(
  worksheet: Worksheet,
  header: XlsxColumn[][]
): number {
  let count = 0;
  for (const _ of iterateWorksheetRows(worksheet, header)) {
    count += 1;
  }
  return count;
}

// ---------------------------------------------------------------------------
// FormData helpers
// ---------------------------------------------------------------------------

const RESERVED_FORM_KEYS = new Set(["header", "file"]);

function extractExtraData(formData: FormData): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (!RESERVED_FORM_KEYS.has(key) && typeof value === "string") {
      result[key] = value;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// createImportHandler
// ---------------------------------------------------------------------------

export function createImportHandler<
  // biome-ignore lint/suspicious/noExplicitAny: generic defaults need any
  T = any,
  BatchSize extends number = number,
>(options: CreateImportHandlerOptions<T, BatchSize>) {
  const {
    processorCreator,
    batchSize = 1 as BatchSize,
    sheetName = "Sheet1",
    permission,
    schema,
    onError = "abort",
    maxErrors: configuredMaxErrors = 10,
  } = options;
  const maxErrors = Math.max(1, Math.floor(configuredMaxErrors));

  return async function POST(request: Request) {
    if (permission) {
      // TODO: implement permission check
    }

    try {
      const formData = await request.formData();
      const headerJson = formData.get("header") as string | null;
      const file = formData.get("file") as File | null;

      const extraData = extractExtraData(formData);

      if (!headerJson) {
        return Response.json(
          { error: "Bad Request: 缺少必需的参数 header" },
          { status: 400 }
        );
      }

      let header: XlsxColumn[][];
      try {
        header = JSON.parse(headerJson);
      } catch {
        return Response.json(
          { error: "Bad Request: header 参数格式错误" },
          { status: 400 }
        );
      }

      if (!file) {
        const buffer = await writeExcel(header, sheetName);
        return new Response(buffer, {
          headers: {
            "Content-Type":
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Content-Disposition": 'attachment; filename="template.xlsx"',
          },
        });
      }

      const encoder = new TextEncoder();

      const stream = new ReadableStream({
        async start(controller) {
          const sendEvent = (event: ImportProgressEvent) => {
            controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
          };

          try {
            sendEvent({ type: "info", message: "正在读取文件..." });

            const processor = await Promise.resolve(
              processorCreator(extraData)
            );
            const arrayBuffer = await file.arrayBuffer();
            const worksheet = await loadWorksheet(arrayBuffer, sheetName);

            await runImport({
              worksheet,
              header,
              processor,
              schema,
              batchSize,
              onError,
              maxErrors,
              sendEvent,
            });
          } catch (error: unknown) {
            const err =
              error instanceof ImportError
                ? error
                : (error as {
                    message?: string;
                    details?: Array<{ message: string }>;
                  });
            sendEvent({
              type: "error",
              message: err.message || "导入错误！",
              details:
                err instanceof ImportError
                  ? err.details
                  : (err as { details?: Array<{ message: string }> }).details,
            });
          } finally {
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    } catch (error: unknown) {
      return Response.json(
        { error: `Bad Request: ${(error as Error).message}` },
        { status: 400 }
      );
    }
  };
}
