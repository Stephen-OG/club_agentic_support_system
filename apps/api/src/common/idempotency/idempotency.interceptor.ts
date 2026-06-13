import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  ConflictException
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Observable, from, of, switchMap } from "rxjs";
import { IDEMPOTENT_KEY } from "./idempotent.decorator";
import { IdempotencyService } from "./idempotency.service";

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly service: IdempotencyService
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const isIdempotent = this.reflector.getAllAndOverride<boolean>(IDEMPOTENT_KEY, [
      context.getHandler(),
      context.getClass()
    ]);

    if (!isIdempotent) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const key = request.headers?.["idempotency-key"] || request.headers?.["Idempotency-Key"];

    if (!key) {
      return next.handle();
    }

    return from(this.service.find(key)).pipe(
      switchMap((existing) => {
        if (existing) {
          const response = context.switchToHttp().getResponse();
          response.status(existing.status);
          return of(existing.body);
        }

        return from(this.service.tryAcquire(key)).pipe(
          switchMap((acquired) => {
            if (!acquired) {
              return from(this.service.find(key)).pipe(
                switchMap((existingAfterRace) => {
                  if (existingAfterRace) {
                    const response = context.switchToHttp().getResponse();
                    response.status(existingAfterRace.status);
                    return of(existingAfterRace.body);
                  }
                  throw new ConflictException("Concurrent request with same idempotency key");
                })
              );
            }

            return next.handle().pipe(
              switchMap(async (body) => {
                const response = context.switchToHttp().getResponse();
                const status = response.statusCode;

                if (status < 400) {
                  await this.service.complete(key, status, body);
                }

                return body;
              })
            );
          })
        );
      })
    );
  }
}
