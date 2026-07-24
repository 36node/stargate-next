import ExcelJS from "exceljs";

import type { XlsxColumn } from "./types";

type XlsxColumnWithKey = XlsxColumn & { key: string };

/**
 * 进度提取结果
 */
export type ProgressExtractionResult = {
  /** 提取后的纯净数据 */
  cleanData: Uint8Array;
  /** 最后一个进度值（如果有） */
  progress: number | null;
};

/**
 * 创建进度消息 Buffer
 *
 * 进度协议：固定 4 字节 "PP|-" 格式
 * - PP: 2位数字 (00-99)
 * - 00 代表 100%，01-99 代表实际进度 1%-99%
 */
export function createProgressMessage(progress: number): Buffer {
  const progressValue =
    progress === 100 ? 0 : Math.max(1, Math.min(99, progress));
  return Buffer.from(`${progressValue.toString().padStart(2, "0")}|-`);
}

/**
 * 从流数据中提取进度信息并返回纯净的 Excel 数据
 *
 * 进度协议：固定 4 字节 "PP|-" 格式
 * - PP: 2位数字 (00-99)
 * - 00 代表 100%，01-99 代表实际进度
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: byte-level scanning requires branching
export function extractProgressFromChunk(
  chunk: Uint8Array
): ProgressExtractionResult {
  const segments: Uint8Array[] = [];
  let lastProgressValue: number | null = null;
  let writeStart = 0;
  let searchPos = 0;

  while (searchPos + 4 <= chunk.length) {
    const byte1 = chunk[searchPos];
    const byte2 = chunk[searchPos + 1];
    const byte3 = chunk[searchPos + 2];
    const byte4 = chunk[searchPos + 3];

    const isProgressMessage =
      byte1 >= 48 &&
      byte1 <= 57 &&
      byte2 >= 48 &&
      byte2 <= 57 &&
      byte3 === 124 &&
      byte4 === 45;

    if (isProgressMessage) {
      if (searchPos > writeStart) {
        segments.push(chunk.slice(writeStart, searchPos));
      }

      const rawProgress = (byte1 - 48) * 10 + (byte2 - 48);
      lastProgressValue = rawProgress === 0 ? 100 : rawProgress;

      writeStart = searchPos + 4;
      searchPos += 4;
    } else {
      searchPos += 1;
    }
  }

  if (writeStart < chunk.length) {
    segments.push(chunk.slice(writeStart));
  }

  let cleanData: Uint8Array;
  if (segments.length === 0) {
    cleanData = new Uint8Array(0);
  } else if (segments.length === 1) {
    cleanData = segments[0];
  } else {
    const totalLength = segments.reduce((sum, seg) => sum + seg.length, 0);
    cleanData = new Uint8Array(totalLength);
    let offset = 0;
    for (const segment of segments) {
      cleanData.set(segment, offset);
      offset += segment.length;
    }
  }

  return { cleanData, progress: lastProgressValue };
}

// ---------------------------------------------------------------------------
// Import helpers: readExcel / writeExcel
// ---------------------------------------------------------------------------

export function extractDataColumns(
  headers: XlsxColumn[][]
): XlsxColumnWithKey[] {
  const lastLayer = headers.at(-1);
  if (!lastLayer) {
    return [];
  }
  return lastLayer.filter(
    (col): col is XlsxColumnWithKey => !col.isPlaceholder && !!col.key
  );
}

/**
 * 生成 Excel 模板文件（支持多层表头和列合并）
 */
export async function writeExcel(
  header: XlsxColumn[][],
  sheetName = "Sheet1"
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName);

  const dataColumns = extractDataColumns(header);

  worksheet.columns = dataColumns.map((col) => ({
    key: col.key,
    width: col.width ? Math.round(col.width / 6) : 20,
  }));

  for (const [rowIndex, headerRow] of header.entries()) {
    const row = worksheet.getRow(rowIndex + 1);
    let colIndex = 1;

    for (const col of headerRow) {
      if (col.isPlaceholder) {
        colIndex += 1;
        continue;
      }

      const cell = row.getCell(colIndex);
      cell.value = col.title || "";
      cell.font = { bold: true };

      const colSpan = col.colSpan || 1;
      if (colSpan > 1) {
        worksheet.mergeCells(
          rowIndex + 1,
          colIndex,
          rowIndex + 1,
          colIndex + colSpan - 1
        );
      }

      colIndex += colSpan;
    }

    row.commit();
  }

  return (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
}

function parseCellValue(value: ExcelJS.CellValue): unknown {
  if (value instanceof Date) {
    return value;
  }
  if (value && typeof value === "object" && "richText" in value) {
    return (value as { richText: Array<{ text: string }> }).richText
      .map((rt) => rt.text)
      .join("");
  }
  if (value !== null && value !== undefined) {
    return typeof value === "string" ? value.trim() : value;
  }
  return;
}

/**
 * 构建列映射并校验表头
 */
function buildColumnMapping(
  headerRow: ExcelJS.Row,
  dataColumns: XlsxColumnWithKey[]
): Record<number, XlsxColumnWithKey> {
  const columnMapping: Record<number, XlsxColumnWithKey> = {};
  const expectedTitles = dataColumns.map((col) => col.title);
  const actualTitles: string[] = [];

  headerRow.eachCell({ includeEmpty: false }, (cell, colIndex) => {
    const headerText = String(cell.value || "").trim();
    actualTitles.push(headerText);
    const column = dataColumns.find((c) => c.title === headerText);
    if (column) {
      columnMapping[colIndex] = column;
    }
  });

  const missingTitles = expectedTitles.filter((t) => !actualTitles.includes(t));
  if (missingTitles.length > 0) {
    throw new Error(`缺少必须列：${missingTitles.join(", ")}`);
  }

  return columnMapping;
}

/**
 * 将 ExcelJS 行转为对象
 */
function rowToObject(
  row: ExcelJS.Row,
  columnMapping: Record<number, XlsxColumnWithKey>
): Record<string, unknown> {
  const rowData: Record<string, unknown> = {};
  row.eachCell({ includeEmpty: false }, (cell, colIndex) => {
    const column = columnMapping[colIndex];
    if (column) {
      rowData[column.key] = parseCellValue(cell.value);
    }
  });
  return rowData;
}

/**
 * 加载工作簿并定位目标工作表
 */
export async function loadWorksheet(
  fileData: ArrayBuffer,
  sheetName?: string
): Promise<ExcelJS.Worksheet> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(fileData);

  if (sheetName) {
    const found = workbook.getWorksheet(sheetName);
    if (!found) {
      throw new Error(`缺少必须工作表：${sheetName}`);
    }
    return found;
  }
  return workbook.worksheets[0];
}

/**
 * 从已加载的 worksheet 对象逐行遍历数据行（generator）。
 *
 * 不会重复解析文件，可在同一个 worksheet 上多次调用以实现多阶段遍历。
 */
export function* iterateWorksheetRows(
  worksheet: ExcelJS.Worksheet,
  header: XlsxColumn[][]
): Generator<{ row: Record<string, unknown>; rowNumber: number }> {
  const headerRowCount = header.length;
  const dataColumns = extractDataColumns(header);

  const headerRow = worksheet.getRow(headerRowCount);
  const columnMapping = buildColumnMapping(headerRow, dataColumns);

  const rowCount = worksheet.rowCount;
  for (let i = headerRowCount + 1; i <= rowCount; i++) {
    const row = worksheet.getRow(i);
    if (row.hasValues) {
      yield {
        row: rowToObject(row, columnMapping),
        rowNumber: i,
      };
    }
  }
}

/**
 * 逐行遍历 Excel 数据行（便捷方法）。
 *
 * 内部 loadWorksheet + iterateWorksheetRows。
 * 若需要多次遍历同一文件，应直接使用 loadWorksheet + iterateWorksheetRows 以避免重复解析。
 */
export async function* streamExcelRows(
  fileData: ArrayBuffer,
  header: XlsxColumn[][],
  sheetName?: string
): AsyncGenerator<{ row: Record<string, unknown>; rowNumber: number }> {
  const worksheet = await loadWorksheet(fileData, sheetName);
  yield* iterateWorksheetRows(worksheet, header);
}

/**
 * 读取 Excel 文件并返回对象数组
 */
export async function readExcel(
  fileData: ArrayBuffer,
  header: XlsxColumn[][],
  sheetName?: string
  // biome-ignore lint/suspicious/noExplicitAny: excel rows are untyped
): Promise<any[]> {
  const rows: Record<string, unknown>[] = [];
  for await (const { row } of streamExcelRows(fileData, header, sheetName)) {
    rows.push(row);
  }
  return rows;
}
