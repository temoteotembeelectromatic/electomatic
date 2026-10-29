# Electomatic — Gestão de fundos

## Render deployment

The Render edition runs on Node with **PostgreSQL and a private AWS S3 bucket**, independent employee accounts and one-time invitations. Use the [Render deployment guide](render/README.md) and the root `render.yaml`. All credentials and bucket details are environment variables. The original Sites edition described below remains supported separately.

Company funding requests for Mozambique. Portuguese interface, MZN integer-cent amounts and Africa/Maputo display times. Hosted on Sites with ChatGPT sign-in, D1 records and R2 evidence files.

## First use

1. Open the private Site and sign in as its owner. Configure the company name and 9-digit NUIT. The first signed-in user to configure this **owner-private** deployment becomes administrator; complete this before sharing the Site.
2. Add each employee's ChatGPT email under Equipa, as Técnico or Gestor. Independently grant those people Site access in the Site sharing settings. Adding a member does not send an invitation or alter Site sharing.
3. A manager creates projects with client, location and budget. Technicians submit requests against a project. Another manager approves or rejects with a reason. Self-approval is prohibited, including for administrators.
4. A manager records a full payment with method, beneficiary, transaction reference, date and PDF/JPEG/PNG proof (maximum 10 MB). This records payments; it does not initiate M-Pesa, e-Mola or bank transfers.
5. Attach expense receipts. A manager reviews evidence and closes the request with a verification note.

Every workflow mutation records the authenticated actor and server timestamp. Evidence is append-only through the application, downloaded only after authorization, and includes SHA-256 hashes. Status changes use optimistic concurrency and transactional audit writes. These are application audit records, not independently certified or tamper-proof accounting records.

## Scope

Project budget utilization combines approved, paid and closed requests; pending and rejected requests are excluded. Budgets are advisory, not spending limits. Technician totals contain their own requests only. This version supports full payments, not instalments, refund reconciliation, payroll, tax returns or automatic payment-provider verification. Managers must manually verify authenticity and reconcile receipt values. CSV exports contain filtered request/payment metadata; evidence files remain downloadable from each request.

## Development

Node 22.13+ and npm, Git and tar are required. Run `npm run install:ci`, `npm run db:generate` after schema changes, and `npm run build`. For local preview apply generated SQL to local D1 per the Sites starter guide, then `npm run dev`. `node scripts/test-workflow.mjs` checks permissions, concurrency, payment proof and closure using in-memory SQLite and an R2 mock.

The hosting manifest keeps the Site ID and DB/BUCKET bindings. Production authentication is injected by Sites, not user-selectable roles. Local loopback development has the starter's mock ChatGPT sign-in; never expose the development server to the internet.

GitHub: https://github.com/temoteotembeelectromatic/electomatic
