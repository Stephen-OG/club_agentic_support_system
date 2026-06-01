import { Module, Global } from "@nestjs/common";
import { RedisCacheService } from "./redis-cache.service";

@Global()
@Module({
  exports: [RedisCacheService],
  providers: [RedisCacheService]
})
export class CacheModule {}
