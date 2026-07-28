import { randomUUID } from "node:crypto";
import { PassThrough, Readable } from "node:stream";

import ExcelJS from "exceljs";

import type {
  CreateExportHandlerOptions,
  ExportRequestBody,
  ExportTokenPayload,
  XlsxColumn,
} from "./types";
import { createProgressMessage, extractDataColumns } from "./utils";

const EXPORT_TOKEN_TTL_SECONDS = 60 * 5;
const memoryExportTokenStore = new Map<
  string,
  { payload: ExportTokenPayload; expiresAt: number }
>();

function setExportToken(payload: ExportTokenPayload): string {
  const token = randomUUID();
  memoryExportTokenStore.set(token, {
    payload,
    expiresAt: Date.now() + EXPORT_TOKEN_TTL_SECONDS * 1000,
  });
  return token;
}

function getExportToken(token: string): ExportTokenPayload | null {
  const entry = memoryExportTokenStore.get(token);
  if (!entry) {
    return null;
  }
  if (Date.now() > entry.expiresAt) {
    memoryExportTokenStore.delete(token);
    return null;
  }
  return entry.payload;
}

function buildContentDisposition(filename?: string) {
  const safeName = (filename || "export.xlsx").replace(/[\\/:*?"<>|]+/g, "_");
  const finalName = safeName.toLowerCase().endsWith(".xlsx")
    ? safeName
    : `${safeName}.xlsx`;
  const encoded = encodeURIComponent(finalName);
  const asciiFallback = "export.xlsx";
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}

/**
 * 生成 Excel 流（共享逻辑，供 POST 和 GET 两种模式复用）
 *
 * @param directDownload 是否为"原生下载"模式（true 时不插入进度标记）
 */
function buildExcelStream(
  header: XlsxColumn[][],
  // biome-ignore lint/suspicious/noExplicitAny: generic fetch function
  fetchData: (page: number) => Promise<{ total: number; rows: any[] }>,
  sheetName: string,
  directDownload: boolean
): { stream: PassThrough; webReadable: ReadableStream } {
  const excelStream = new PassThrough();
  const webReadable = Readable.toWeb(excelStream) as ReadableStream;

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: xlsx streaming requires nested loops
  (async () => {
    try {
      const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
        stream: excelStream,
      });

      const worksheet = workbook.addWorksheet(sheetName);
      const dataColumns = extractDataColumns(header);

      worksheet.columns = dataColumns.map((col) => ({
        key: col.key ?? "",
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

      let page = 0;
      let processedRows = 0;

      while (true) {
        const { total, rows: data } = await fetchData(page);

        if (!data || data.length === 0) {
          break;
        }

        for (const row of data) {
          worksheet.addRow(row as Record<string, unknown>).commit();
          processedRows += 1;
        }

        if (!directDownload) {
          const actualProgress = Math.round((processedRows / total) * 100);
          excelStream.write(createProgressMessage(actualProgress));
        }

        page += 1;

        if (processedRows >= total) {
          break;
        }
      }

      await workbook.commit();
      excelStream.end();
    } catch (error) {
      excelStream.destroy(error as Error);
    }
  })();

  return { stream: excelStream, webReadable };
}

/**
 * 创建导出 Handler（单 POST，流式写入 + 分页查询 + 进度协议）
 *
 * 适用于桌面端 StreamSaver 模式。
 */
export function createExportHandler<
  // biome-ignore lint/suspicious/noExplicitAny: generic defaults need any
  Query extends Record<string, any> = Record<string, any>,
  // biome-ignore lint/suspicious/noExplicitAny: generic defaults need any
  T = any,
>(options: CreateExportHandlerOptions<Query, T>) {
  const { fetchCreator, sheetName = "Sheet1", permission } = options;

  return async function POST(request: Request) {
    if (permission) {
      // TODO: implement permission check
    }

    const body: ExportRequestBody<Query> = await request
      .json()
      // biome-ignore lint/suspicious/noExplicitAny: fallback for malformed JSON
      .catch(() => ({}) as any);
    const { header, query } = body;

    if (!(header && Array.isArray(header)) || header.length === 0) {
      return Response.json(
        { error: "Bad Request: header configuration is required" },
        { status: 400 }
      );
    }

    const fetchData = await Promise.resolve(fetchCreator(query));

    const { webReadable } = buildExcelStream(
      header,
      fetchData,
      sheetName,
      false
    );

    return new Response(webReadable, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": "attachment",
        "Cache-Control": "no-store",
      },
    });
  };
}

/**
 * 创建导出 Handlers（GET + POST）
 *
 * 在 `createExportHandler` 基础上增加移动端兼容：
 * - POST?prepare=1：保存导出参数到内存，返回 token
 * - GET?download=1&token=...：用 token 取回参数，返回纯净 xlsx（无进度标记）
 */
export function createExportHandlers<
  // biome-ignore lint/suspicious/noExplicitAny: generic defaults need any
  Query extends Record<string, any> = Record<string, any>,
  // biome-ignore lint/suspicious/noExplicitAny: generic defaults need any
  T = any,
>(options: CreateExportHandlerOptions<Query, T>) {
  const { fetchCreator, sheetName = "Sheet1", permission } = options;
  const postHandler = createExportHandler<Query, T>(options);

  const POST = async (request: Request) => {
    const url = new URL(request.url);

    if (url.searchParams.get("prepare") === "1") {
      if (permission) {
        // TODO: implement permission check
      }

      const body: ExportRequestBody<Query> = await request
        .json()
        // biome-ignore lint/suspicious/noExplicitAny: fallback for malformed JSON
        .catch(() => ({}) as any);
      const { query, header, filename } = body;

      if (!(header && Array.isArray(header)) || header.length === 0) {
        return Response.json(
          { error: "Bad Request: header configuration is required" },
          { status: 400 }
        );
      }

      const token = setExportToken({ query, header, filename });
      return Response.json({ token }, { status: 200 });
    }

    return postHandler(request);
  };

  const GET = async (request: Request) => {
    const url = new URL(request.url);
    const isDownload = url.searchParams.get("download") === "1";
    const token = url.searchParams.get("token");

    if (!(isDownload && token)) {
      return Response.json(
        { error: "Bad Request: missing download=1 or token" },
        { status: 400 }
      );
    }

    if (permission) {
      // TODO: implement permission check
    }

    const payload = await getExportToken(token);
    if (!payload) {
      return Response.json(
        { error: "Bad Request: token is invalid or expired" },
        { status: 400 }
      );
    }

    const fetchData = await Promise.resolve(
      fetchCreator(payload.query as Query | undefined)
    );

    const { webReadable } = buildExcelStream(
      payload.header,
      fetchData,
      sheetName,
      true
    );

    return new Response(webReadable, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": buildContentDisposition(payload.filename),
        "Cache-Control": "no-store",
      },
    });
  };

  return { GET, POST };
}
