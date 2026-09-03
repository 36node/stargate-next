import { describe, expect, it } from "vitest";
import { z } from "zod";

import { baseSearchSchema, searchToTableQuery } from "./helper";

describe("baseSearchSchema", () => {
  it("coerces page and size from strings", () => {
    const result = baseSearchSchema.safeParse({ page: "2", size: "20" });

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }
    expect(result.data).toEqual({ page: 2, size: 20 });
  });

  it("accepts missing pagination and sort fields", () => {
    const result = baseSearchSchema.safeParse({});

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }
    expect(result.data).toEqual({});
  });

  it("exposes flatten().fieldErrors on validation failure", () => {
    const schema = z.object({ requiredText: z.string() });
    const result = schema.safeParse({});

    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }
    expect(result.error.flatten().fieldErrors).toEqual({
      requiredText: expect.arrayContaining([expect.any(String)]),
    });
  });
});

describe("searchToTableQuery", () => {
  const filterSchema = baseSearchSchema.extend({
    status: z.string().optional(),
  });

  it("builds pagination, sorting, and column filters from search", () => {
    const query = searchToTableQuery(
      {
        page: "1",
        size: "10",
        sort: "-createdAt",
        status: "active",
      },
      filterSchema
    );

    expect(query).toEqual({
      pagination: { pageIndex: 1, pageSize: 10 },
      sorting: [{ id: "createdAt", desc: true }],
      columnFilters: [{ id: "status", value: "active" }],
    });
  });

  it("preserves extra filter fields when using the default base schema", () => {
    const query = searchToTableQuery({
      page: 0,
      size: 25,
      tenant: "test",
    });

    expect(query.pagination).toEqual({ pageIndex: 0, pageSize: 25 });
    expect(query.columnFilters).toEqual([{ id: "tenant", value: "test" }]);
  });
});
