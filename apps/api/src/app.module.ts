import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard } from "@nestjs/throttler";
import { ThrottlerModule } from "@nestjs/throttler";
import { AnalyticsModule } from "./analytics/analytics.module";
import { AuditModule } from "./audit/audit.module";
import { CacheModule } from "./common/cache/cache.module";
import { IdempotencyModule } from "./common/idempotency/idempotency.module";
import { AuthModule } from "./auth/auth.module";
import { ConversationsModule } from "./conversations/conversations.module";
import { DatabaseModule } from "./database/database.module";
import { HealthModule } from "./health/health.module";
import { IntegrationsModule } from "./integrations/integrations.module";
import { JobsModule } from "./jobs/jobs.module";
import { LoggerModule } from "./common/logger/logger.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { LaunchModule } from "./launch/launch.module";
import { RealtimeModule } from "./realtime/realtime.module";
import { RequestsModule } from "./requests/requests.module";
import { getRateLimitConfig } from "./security/security-config";
import { ServicePointsModule } from "./service-points/service-points.module";
import { SetupModule } from "./signup/signup.module";
import { StaffModule } from "./staff/staff.module";
import { TenantsModule } from "./tenants/tenants.module";
import { TriageModule } from "./triage/triage.module";
import { VenuesModule } from "./venues/venues.module";
import { WebhooksModule } from "./webhooks/webhooks.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: [".env", "../../.env"],
      isGlobal: true
    }),
    ThrottlerModule.forRoot(getRateLimitConfig()),
    DatabaseModule,
    HealthModule,
    AuthModule,
    TenantsModule,
    VenuesModule,
    ServicePointsModule,
    StaffModule,
    ConversationsModule,
    RealtimeModule,
    RequestsModule,
    TriageModule,
    LaunchModule,
    NotificationsModule,
    WebhooksModule,
    IntegrationsModule,
    AnalyticsModule,
    AuditModule,
    CacheModule,
    IdempotencyModule,
    JobsModule,
    SetupModule,
    LoggerModule
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard
    }
  ]
})
export class AppModule {}
