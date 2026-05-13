import { Body, Controller, Post } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { ClassifyPriorityDto } from "./dto/classify-priority.dto";
import { PriorityClassifierService } from "./priority-classifier.service";

@ApiTags("triage")
@Controller("triage")
export class TriageController {
  constructor(private readonly priorityClassifier: PriorityClassifierService) {}

  @Post("priority")
  @ApiOkResponse({ description: "Deterministically classifies message priority" })
  classifyPriority(@Body() input: ClassifyPriorityDto) {
    return {
      priority: this.priorityClassifier.classify(input.message)
    };
  }
}
