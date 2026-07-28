import { z } from "zod";

export const booleanish = z
  .union([
    z.boolean(),
    z.enum(["true", "false"]).transform((v) => v === "true"),
  ])
  .optional();
