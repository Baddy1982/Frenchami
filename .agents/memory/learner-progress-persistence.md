---
name: Learner progress persistence
description: Durable design constraint for saved words, learned vocabulary, quiz attempts, and XP.
---

Progress tables are keyed by the Clerk user ID; authenticated identity replaces the former demo learner without changing mutation contracts.

**Why:** Clerk session identity is the durable cross-device boundary, while the learning API remains independent of Clerk profile fields.

**How to apply:** Derive the learner key only on the server from `getAuth(req)`, protect all progress mutations and reads, and keep public lesson content separate.