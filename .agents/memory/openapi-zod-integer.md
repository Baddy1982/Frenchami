---
name: OpenAPI integer compatibility
description: Generated Zod schemas currently target a Zod version without z.int().
---

When adding numeric response fields to the OpenAPI contract, use `number` unless integer-specific validation is essential; the current generator emits z.int(), which fails the workspace typecheck.

**Why:** Code generation succeeded but the generated schema could not compile against the installed Zod runtime.

**How to apply:** Prefer number in new OpenAPI schemas and enforce integer semantics in server logic when needed.