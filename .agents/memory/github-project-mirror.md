---
name: GitHub project mirror
description: The complete Frenchami project is mirrored to the user's GitHub repository during ongoing development.
---

Keep the complete project synchronized to the GitHub repository `Baddy1982/Frenchami` as development continues.

**Why:** The user explicitly wants a durable GitHub copy of the project while collaborating on future updates.

**How to apply:** After meaningful code changes, update the GitHub repository through the connected GitHub integration, verify the remote tree when practical, and never upload secrets or environment files. Task-agent merges do not automatically update the mirror, so synchronize after each merge.

**Current constraint:** The connected GitHub account can read repository metadata but returned HTTP 403 for the Contents API at workflow paths. Refresh the GitHub authorization with workflow-file access before mirroring CI workflow changes.