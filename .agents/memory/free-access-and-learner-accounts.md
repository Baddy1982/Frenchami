---
name: Free access and learner accounts
description: The product's boundary between public learning tools and account-only progress.
---

Keep the core French learning tools public. Ask users to sign up only when they save a word, retain quiz progress, view their personal dashboard, or enter a premium experience.

**Why:** Requiring registration before visitors can experience the dictionary, translation, vocabulary, or practice created unnecessary friction and obscured the distinction between a learner account and Replit project ownership.

**How to apply:** Preserve public routes and clear, contextual account prompts. Future premium products should share the learner identity rather than introduce a second login.

The current premium entry point is an external Frenchami Next.js access-request screen. Frenchami verifies an active Stripe subscription before handing learners to that server-controlled URL.

**Why:** The public premium screen currently exposes Auth0 markers, while Frenchami uses the Replit-managed Clerk tenant. An active subscription can safely unlock the handoff, but the free app cannot create a shared session in a different auth system.

**How to apply:** Do not pass learner identity or session data through a redirect. Keep the destination server-configured and Stripe-gated. To offer one-login access, migrate or configure the external premium app to use the same Clerk Production tenant first.