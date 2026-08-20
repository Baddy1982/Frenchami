---
name: Stripe connection runtime
description: Connector credential naming and migration-asset handling for the Stripe integration.
---

Use the connected Stripe credential’s `secret` field, while accepting `secret_key` only as a compatibility fallback. When `stripe-replit-sync` is bundled into the API server, copy its migration directory beside the compiled server output before calling its migration runner.

**Why:** The configured connector does not use the generic `secret_key` property. The sync library locates SQL migrations relative to its compiled module, which changes when the package is bundled.

**How to apply:** Keep credentials inside the Replit connection API. If the server build strategy changes, either preserve the sync package’s module-relative migrations or externalize it so its own migration directory remains available.