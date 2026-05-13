import { Module } from "@nestjs/common";
import { AiTriageService } from "./ai-triage.service";
import { PriorityClassifierService } from "./priority-classifier.service";
import { ReplyGuardService } from "./reply-guard.service";
import { TriageController } from "./triage.controller";

@Module({
  controllers: [TriageController],
  exports: [AiTriageService, PriorityClassifierService, ReplyGuardService],
  providers: [AiTriageService, PriorityClassifierService, ReplyGuardService]
})
export class TriageModule {}
