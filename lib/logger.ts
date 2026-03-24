type LogLevel = "info" | "warn" | "error";

interface LogEvent {
  level: LogLevel;
  scope: string;
  message: string;
  data?: Record<string, unknown>;
}

function emit(event: LogEvent): void {
  const ts = new Date().toISOString();
  const prefix = `[${ts}] [${event.level.toUpperCase()}] [${event.scope}]`;
  const payload = event.data ? ` ${JSON.stringify(event.data)}` : "";

  switch (event.level) {
    case "error":
      console.error(`${prefix} ${event.message}${payload}`);
      break;
    case "warn":
      console.warn(`${prefix} ${event.message}${payload}`);
      break;
    default:
      console.log(`${prefix} ${event.message}${payload}`);
  }
}

export function createLogger(scope: string) {
  return {
    info(message: string, data?: Record<string, unknown>) {
      emit({ level: "info", scope, message, data });
    },
    warn(message: string, data?: Record<string, unknown>) {
      emit({ level: "warn", scope, message, data });
    },
    error(message: string, data?: Record<string, unknown>) {
      emit({ level: "error", scope, message, data });
    },
  };
}
