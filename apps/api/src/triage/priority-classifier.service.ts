import { Injectable } from "@nestjs/common";
import { classifyPriority, type RequestPriority } from "@madupe/shared";

@Injectable()
export class PriorityClassifierService {
  classify(message: string): RequestPriority | null {
    return classifyPriority(message);
  }

  classifyOrDefault(message: string): RequestPriority {
    return this.classify(message) || "normal";
  }
}
