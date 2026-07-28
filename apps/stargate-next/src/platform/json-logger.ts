import type { LoggerService } from "@nestjs/common";

export type LogLevel = "debug" | "error" | "fatal" | "info" | "warn";
export type LogBindings = Record<string, unknown>;
export type LogWriter = (line: string) => void;

const LOG_LEVEL_VALUES: Record<LogLevel, number> = {
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

const LOG_LEVELS = new Set<LogLevel>(
  Object.keys(LOG_LEVEL_VALUES) as LogLevel[]
);

function asBindings(value: unknown): LogBindings | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return;
  }
  return value as LogBindings;
}

function stringifyMessage(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}

export function resolveLogLevel(value = process.env.LOG_LEVEL): LogLevel {
  const normalized = value?.toLowerCase();
  return normalized && LOG_LEVELS.has(normalized as LogLevel)
    ? (normalized as LogLevel)
    : "info";
}

export class JsonLogger implements LoggerService {
  private readonly bindings: LogBindings;
  private readonly level: LogLevel;
  private readonly writer: LogWriter;

  constructor({
    bindings = {},
    level = resolveLogLevel(),
    writer = (line) => console.log(line),
  }: {
    bindings?: LogBindings;
    level?: LogLevel;
    writer?: LogWriter;
  } = {}) {
    this.bindings = bindings;
    this.level = level;
    this.writer = writer;
  }

  child(bindings: LogBindings): JsonLogger {
    return new JsonLogger({
      bindings: { ...this.bindings, ...bindings },
      level: this.level,
      writer: this.writer,
    });
  }

  debug(bindings: LogBindings, msg?: string): void;
  debug(msg: string): void;
  debug(bindingsOrMessage: LogBindings | string, msg?: string): void {
    this.write("debug", bindingsOrMessage, msg);
  }

  info(bindings: LogBindings, msg?: string): void;
  info(msg: string): void;
  info(bindingsOrMessage: LogBindings | string, msg?: string): void {
    this.write("info", bindingsOrMessage, msg);
  }

  warn(bindings: LogBindings, msg?: string): void;
  warn(msg: string): void;
  warn(bindingsOrMessage: LogBindings | string, msg?: string): void {
    this.write("warn", bindingsOrMessage, msg);
  }

  fatal(bindings: LogBindings, msg?: string): void;
  fatal(msg: string): void;
  fatal(bindingsOrMessage: LogBindings | string, msg?: string): void {
    this.write("fatal", bindingsOrMessage, msg);
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    const bindings = asBindings(message);
    if (bindings) {
      this.write("error", bindings, optionalParams[0] as string | undefined);
      return;
    }

    const [stack, context] = optionalParams;
    this.write(
      "error",
      {
        ...(typeof context === "string" ? { context } : {}),
        ...(typeof stack === "string" ? { stack } : {}),
      },
      stringifyMessage(message)
    );
  }

  log(message: unknown, context?: string): void {
    this.write(
      "info",
      typeof context === "string" ? { context } : {},
      stringifyMessage(message)
    );
  }

  verbose(message: unknown, context?: string): void {
    this.write(
      "debug",
      typeof context === "string" ? { context } : {},
      stringifyMessage(message)
    );
  }

  private write(
    level: LogLevel,
    bindingsOrMessage: LogBindings | string,
    msg?: string
  ): void {
    if (LOG_LEVEL_VALUES[level] < LOG_LEVEL_VALUES[this.level]) {
      return;
    }

    const bindings =
      typeof bindingsOrMessage === "string" ? {} : bindingsOrMessage;
    const resolvedMessage =
      typeof bindingsOrMessage === "string" ? bindingsOrMessage : msg;
    this.writer(
      JSON.stringify({
        ...this.bindings,
        ...bindings,
        level: LOG_LEVEL_VALUES[level],
        msg: resolvedMessage,
        pid: process.pid,
        time: Date.now(),
      })
    );
  }
}
