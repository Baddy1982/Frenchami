---
name: Clerk in-app routing
description: Production Clerk sign-in routes must remain on the application host.
---

Use Clerk's proxy-backed, in-app `/sign-in` and `/sign-up` routes, including full-path component props and router callbacks. Configure the provider with these URLs so calls such as `RedirectToSignIn` remain on the app host.

**Why:** The hosted `accounts.<app-domain>` redirect can close the connection in production even when the app's primary deployment and API are healthy.

**How to apply:** When changing auth or Wouter routing, preserve the canonical Clerk proxy wiring and test a signed-out browser visit to the home route before publishing.