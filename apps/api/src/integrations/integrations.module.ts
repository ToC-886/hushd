import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type {
  CsamScanProvider,
  EmailProvider,
  IdVerificationProvider,
  PaymentProcessor,
} from "@hushd/shared";
import { NoopCsamScanProvider } from "./noop-csam.provider";
import { NoopEmailProvider } from "./noop-email.provider";
import { NoopIdVerificationProvider } from "./noop-idv.provider";
import { ProcessorRegistry } from "./processor-registry";
import { CcbillStubProcessor } from "./ccbill-stub.processor";
import { SegpayStubProcessor } from "./segpay-stub.processor";
import { CSAM_PROVIDER, EMAIL_PROVIDER, IDV_PROVIDER, PAYMENT_PROCESSORS } from "./integrations.tokens";

@Module({
  providers: [
    {
      provide: PAYMENT_PROCESSORS,
      inject: [ConfigService],
      useFactory: (config: ConfigService): PaymentProcessor[] => {
        const processors: PaymentProcessor[] = [new SegpayStubProcessor(), new CcbillStubProcessor()];
        const enabled = (config.get<string>("PAYMENT_PROCESSORS_ENABLED") ?? "segpay_stub,ccbill_stub")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        return processors.filter((p) => enabled.includes(p.id));
      },
    },
    {
      provide: IDV_PROVIDER,
      useFactory: (): IdVerificationProvider => new NoopIdVerificationProvider(),
    },
    {
      provide: CSAM_PROVIDER,
      useFactory: (): CsamScanProvider => new NoopCsamScanProvider(),
    },
    {
      provide: EMAIL_PROVIDER,
      useFactory: (): EmailProvider => new NoopEmailProvider(),
    },
    ProcessorRegistry,
  ],
  exports: [PAYMENT_PROCESSORS, IDV_PROVIDER, CSAM_PROVIDER, EMAIL_PROVIDER, ProcessorRegistry],
})
export class IntegrationsModule {}
