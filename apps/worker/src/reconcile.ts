import { ComplianceEventType, PrismaClient, TransactionStatus } from "@prisma/client";
import {
  CcbillStubProcessor,
  SegpayStubProcessor,
  type BillingHistoryItem,
  type PaymentProcessor,
} from "@hushd/shared";

type DiscrepancyReport = {
  processor: string;
  missingInternal: BillingHistoryItem[];
  missingExternal: string[];
  amountMismatch: Array<{ processorTxnId: string; processorGrossCents: number; internalGrossCents: number }>;
};

function enabledProcessors(): PaymentProcessor[] {
  const available: PaymentProcessor[] = [new SegpayStubProcessor(), new CcbillStubProcessor()];
  const enabled = (process.env.PAYMENT_PROCESSORS_ENABLED ?? "segpay_stub,ccbill_stub")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return available.filter((p) => enabled.includes(p.id));
}

async function reconcileProcessor(
  prisma: PrismaClient,
  processor: PaymentProcessor,
  since: Date,
): Promise<DiscrepancyReport> {
  const history = await processor.fetchBillingHistory(since.toISOString());
  const internalTxns = await prisma.transaction.findMany({
    where: {
      processor: processor.id,
      status: { in: [TransactionStatus.SUCCEEDED, TransactionStatus.REVERSED] },
      occurredAt: { gte: since },
    },
    select: { processorTxnId: true, grossCents: true },
  });

  const internalByTxnId = new Map(internalTxns.map((t) => [t.processorTxnId, t.grossCents]));
  const processorTxnIds = new Set(history.map((h) => h.processorTxnId));

  const missingInternal = history.filter((h) => !internalByTxnId.has(h.processorTxnId));
  const amountMismatch = history
    .filter((h) => internalByTxnId.has(h.processorTxnId) && internalByTxnId.get(h.processorTxnId) !== h.grossCents)
    .map((h) => ({
      processorTxnId: h.processorTxnId,
      processorGrossCents: h.grossCents,
      internalGrossCents: internalByTxnId.get(h.processorTxnId) ?? 0,
    }));
  const missingExternal = internalTxns
    .map((t) => t.processorTxnId)
    .filter((id) => !processorTxnIds.has(id));

  return { processor: processor.id, missingInternal, missingExternal, amountMismatch };
}

async function runReconciliation(prisma: PrismaClient, lookbackHours: number) {
  const since = new Date(Date.now() - lookbackHours * 60 * 60 * 1000);
  const processors = enabledProcessors();

  for (const processor of processors) {
    try {
      const report = await reconcileProcessor(prisma, processor, since);
      const discrepancyCount =
        report.missingInternal.length + report.missingExternal.length + report.amountMismatch.length;

      // eslint-disable-next-line no-console
      console.log("reconciliation_run", {
        processor: report.processor,
        since: since.toISOString(),
        discrepancies: discrepancyCount,
      });

      if (discrepancyCount === 0) continue;

      await prisma.complianceEvent.create({
        data: {
          eventType: ComplianceEventType.BILLING_RECONCILIATION_DISCREPANCY,
          payload: {
            processor: report.processor,
            windowStart: since.toISOString(),
            missingInternal: report.missingInternal.slice(0, 50),
            missingExternal: report.missingExternal.slice(0, 50),
            amountMismatch: report.amountMismatch.slice(0, 50),
            counts: {
              missingInternal: report.missingInternal.length,
              missingExternal: report.missingExternal.length,
              amountMismatch: report.amountMismatch.length,
            },
          },
        },
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("reconciliation_failed", {
        processor: processor.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

export function startBillingReconciliationLoop(prisma: PrismaClient) {
  const intervalMs = Number(process.env.RECONCILIATION_INTERVAL_MS ?? 10 * 60 * 1000);
  const enabled = process.env.RECONCILIATION_ENABLED !== "false";
  if (!enabled) return;

  const runOnce = () => {
    const lookbackHours = Number(process.env.RECONCILIATION_LOOKBACK_HOURS ?? 24);
    void runReconciliation(prisma, lookbackHours);
  };

  runOnce();
  setInterval(runOnce, intervalMs).unref();
}
