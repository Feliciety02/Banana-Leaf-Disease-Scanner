# Deprecated Mobile Backend

This Laravel application is retained only as pre-consolidation reference code. It is no longer required or supported as a BananaCare runtime service.

Both `web-frontend/` and `mobile-frontend/` now authenticate, read disease information, store diagnoses, synchronize UUID-tagged offline records, and query history through `../web-backend` on port `8001`. Do not run this directory on port `8002` during normal development.

The source and empty development database have not been deleted so the earlier implementation remains auditable. See `../docs/backend-consolidation.md` for the data preflight and conflict-safe migration strategy.
