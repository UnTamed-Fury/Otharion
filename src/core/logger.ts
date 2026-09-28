export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

export function createLogger(context: string): Logger {
  function format(level: LogLevel, message: string): string {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${level}] [${context}] ${message}`;
  }

  return {
    debug(message: string, ...args: unknown[]): void {
      if (process.env.DEBUG === 'true') {
        console.debug(format('DEBUG', message), ...args);
      }
    },
    info(message: string, ...args: unknown[]): void {
      console.info(format('INFO', message), ...args);
    },
    warn(message: string, ...args: unknown[]): void {
      console.warn(format('WARN', message), ...args);
    },
    error(message: string, ...args: unknown[]): void {
      console.error(format('ERROR', message), ...args);
    },
  };
}
