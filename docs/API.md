# API

Versioned under `/api/v1` (handover §35, §40). Conventions: JSON, Zod-validated, standardized
error envelope, server-side authorization inside domain services, idempotency keys on critical
writes, pagination on all list endpoints, explicit DTO projections (no `select(*)`), and a documented
cache class for every GET (handover §34A.5).

Error envelope:

```json
{ "error": { "code": "DIVISION_FULL", "message": "…", "requestId": "…" } }
```

Endpoint inventory: see handover §40. Filled in per phase.
