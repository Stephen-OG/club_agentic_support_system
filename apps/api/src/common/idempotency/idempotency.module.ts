import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { DatabaseModule } from "../../database/database.module";
import { IdempotencyInterceptor } from "./idempotency.interceptor";
import { IdempotencyService } from "./idempotency.service";

@Module({
  exports: [IdempotencyService],
  imports: [DatabaseModule],
  providers: [
    IdempotencyInterceptor,
    IdempotencyService,
    {
      provide: APP_INTERCEPTOR,
      useClass: IdempotencyInterceptor
    }
  ]
})
export class IdempotencyModule {}
