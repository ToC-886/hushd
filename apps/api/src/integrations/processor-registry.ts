import { Inject, Injectable } from "@nestjs/common";
import type { PaymentProcessor } from "@hushd/shared";
import { PAYMENT_PROCESSORS } from "./integrations.tokens";

@Injectable()
export class ProcessorRegistry {
  constructor(@Inject(PAYMENT_PROCESSORS) private readonly processors: PaymentProcessor[]) {}

  getDefault(): PaymentProcessor {
    const first = this.processors[0];
    if (!first) {
      throw new Error("No payment processors configured");
    }
    return first;
  }

  getById(id: string): PaymentProcessor | undefined {
    return this.processors.find((p) => p.id === id);
  }
}
