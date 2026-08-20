---
name: Progress response caching
description: Cache requirements for authenticated saved words, learned words, quiz attempts, and XP.
---

Authenticated learning-state reads and mutation responses must send fresh JSON without HTTP caching or ETag validators.

**Why:** Browser conditional responses can reuse stale learner state after a save or toggle, making persisted progress appear to disappear after reload even when the database row exists.

**How to apply:** For endpoints returning learner progress, set `Cache-Control: no-store` and avoid response ETags; use React Query for short-lived in-app cache updates and refetch on mount.