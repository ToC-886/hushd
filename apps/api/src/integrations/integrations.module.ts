import { Logger, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  CcbillStubProcessor,
  SegpayStubProcessor,
  type IdVerificationProvider,
  type PaymentProcessor,
} from "@hushd/shared";
import { NoopIdVerificationProvider } from "./noop-idv.provider";
import { VeriffIdVerificationProvider } from "./veriff-idv.provider";
import { ProcessorRegistry } from "./processor-registry";
import { IDV_PROVIDER, PAYMENT_PROCESSORS } from "./integrations.tokens";

const logger = new Logger("IntegrationsModule");

@Module({
  providers: [
    {
      provide: PAYMENT_PROCESSORS,
      inject: [ConfigService],
      useFactory: (config: ConfigService): PaymentProcessor[] => {
        const available: PaymentProcessor[] = [new SegpayStubProcessor(), new CcbillStubProcessor()];
        const enabled = (config.get<string>("PAYMENT_PROCESSORS_ENABLED") ?? "segpay_stub,ccbill_stub")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        return available.filter((p) => enabled.includes(p.id));
      },
    },
    {
      provide: IDV_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): IdVerificationProvider => {
        const vendor = (config.get<string>("IDV_PROVIDER") ?? "noop").trim().toLowerCase();
        if (vendor === "veriff") {
          const veriff = VeriffIdVerificationProvider.fromEnv();
          if (veriff) return veriff;
          logger.warn("IDV_PROVIDER=veriff but VERIFF_API_KEY/VERIFF_API_SECRET missing — falling back to noop");
        }
        return new NoopIdVerificationProvider();
      },
    },
    ProcessorRegistry,
  ],
  exports: [PAYMENT_PROCESSORS, IDV_PROVIDER, ProcessorRegistry],
})
export class IntegrationsModule {}
