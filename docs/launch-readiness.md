# Launch readiness checklist (enterprise gate)

## Product and legal gates

- [ ] Legal counsel sign-off on 2257 process, DMCA workflow, and jurisdiction policy.
- [ ] Processor contracts active for Segpay and CCBill production tenants.
- [ ] Verification vendor production keys configured and callback signatures validated.

## Security and compliance gates

- [ ] OWASP ASVS L2 checklist reviewed and signed.
- [ ] Penetration test completed and critical findings remediated.
- [ ] Secrets rotation drill performed in staging and production.

## Reliability and operations gates

- [ ] Disaster recovery drill completed with measured RTO/RPO.
- [ ] Processor outage playbook tested with failover simulation.
- [ ] On-call, alert routing, and escalation matrix published.

## Data integrity gates

- [ ] Webhook replay tests confirm idempotent billing mutation behavior.
- [ ] Ledger reconciliation job reports zero unexplained variances.
- [ ] Compliance and audit export spot checks succeed.
