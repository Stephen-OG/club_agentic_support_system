import { Injectable, LoggerService } from "@nestjs/common";

@Injectable()
export class StructuredLogger implements LoggerService {
  log(message: string, context?: string) {
    this.write("info", message, context);
  }

  error(message: string, trace?: string, context?: string) {
    this.write("error", message, context, { trace });
  }

  warn(message: string, context?: string) {
    this.write("warn", message, context);
  }

  debug(message: string, context?: string) {
    this.write("debug", message, context);
  }

  verbose(message: string, context?: string) {
    this.write("verbose", message, context);
  }

  private write(level: string, message: string, context?: string, extra?: Record<string, unknown>) {
    console.log(
      JSON.stringify({
        context,
        level,
        message,
        timestamp: new Date().toISOString(),
        ...extra
      })
    );
  }
}
