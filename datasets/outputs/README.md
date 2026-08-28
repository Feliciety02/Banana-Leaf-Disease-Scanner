# Generated dataset outputs

- `cohorts/` contains versioned cohort manifests and blocked diagnostics.
- `splits/` contains frozen split artifacts or gate-failure reports.

A filename that looks final is not proof of readiness. Always inspect the
artifact's `status` and validation summary before training.

Existing artifacts retain the absolute paths recorded when they were created.
See [`../docs/layout-migration-2026-08-28.md`](../docs/layout-migration-2026-08-28.md)
before interpreting a pre-migration path; regenerate a new version rather than
editing fingerprinted evidence in place.
