# Cutover plan and go-live checklist

## Cutover (one day, GrowaLabs on call)
1. **Freeze** entry in the old system at the agreed time. Write the time down.
2. **Final stock count** in the shop. Start an audit (`POST /stock/audits`) and scan every piece. Do not approve yet.
3. **Run the import** with the latest stock file (`docs/demo-b1.sh` shows the calls). Preview first. Reconcile: item count, pieces and cost value against the file totals (the preview prints how the file's footer reconciles, including negative rows) and against the physical count. Fix the review queue (missing size, HSN, several sizes in one row). **Sign off in writing.**
4. Load vendors, customers and opening outstanding balances (`POST /imports` target vendors / customers; opening credit goes in as a B2B receipt or opening bill).
5. **Smoke test on production**: one purchase (PO, GRN, bill, payment), one POS sale at each print size (a4, 2in, 3in, 4x6), one return, one online order in live mode with a small amount and its refund.
6. Turn on the client's live Razorpay keys and the webhook URL, switch the domain, announce.
7. **First day**: GrowaLabs on call with the rollback plan ready.

## Rollback
- Keep the previous image tag and an Atlas snapshot taken just before cutover.
- **Triggers** (decide with the client in advance): any wrong stock number found in the first two hours, a failed payment flow, a duplicate or missing invoice number, or the shop unable to bill for 10 minutes.
- Action: redeploy the previous image; if data was written wrongly, restore the snapshot into a new database and repoint. Staff go back to the old system meanwhile.

## Go-live checklist
- [ ] GST registration done and GSTIN saved if available by then (otherwise GST stays off, which is fine)
- [ ] Business profile: legal name, address, state code 33, PAN, invoice terms and footer, default print size
- [ ] Invoice series and prefixes checked (`GET /number-series`)
- [ ] Roles created for each staff member; manager PIN and discount limits set (`PUT /settings/operations`)
- [ ] GST rate rules confirmed by an Admin, and rules added for every HSN in use (see the data quality report)
- [ ] Client's own Razorpay live keys and webhook secret, Shiprocket account, Brevo sender, B2 buckets (media public, backups private with versioning), Google client
- [ ] `BACKUP_ENCRYPTION_KEY` stored safely outside the system; first backup run and a restore test done
- [ ] Catalyst cron jobs created (see runbook) with `x-cron-secret`
- [ ] Uptime check on `/health`, error alerts by email, Atlas usage alerts
- [ ] A real test order and its refund done in live mode
- [ ] Written approval from the client
