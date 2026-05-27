import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard } from "@nestjs/throttler";
import { ThrottlerModule } from "@nestjs/throttler";
import { AnalyticsModule } from "./analytics/analytics.module";
import { AuditModule } from "./audit/audit.module";
import { AuthModule } from "./auth/auth.module";
import { ConversationsModule } from "./conversations/conversations.module";
import { DatabaseModule } from "./database/database.module";
import { HealthModule } from "./health/health.module";
import { IntegrationsModule } from "./integrations/integrations.module";
import { JobsModule } from "./jobs/jobs.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { RequestsModule } from "./requests/requests.module";
import { getRateLimitConfig } from "./security/security-config";
import { ServicePointsModule } from "./service-points/service-points.module";
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
    RequestsModule,
    TriageModule,
    NotificationsModule,
    WebhooksModule,
    IntegrationsModule,
    AnalyticsModule,
    AuditModule,
    JobsModule
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard
    }
  ]
})
export class AppModule {}
