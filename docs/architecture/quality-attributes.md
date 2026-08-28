# Engineering quality attributes

This document defines the boundaries and automated checks that keep DahonMD maintainable, testable, secure, and safe for concurrent development.

## Module boundaries

| Module | Owns | Must not own |
| --- | --- | --- |
| `mobile-frontend/` | On-device thesis inference, preprocessing, local UI, and release checks | Server authorization or central persistence |
| `ai/` | Dataset contracts, training, evaluation, quantization, and research services | Product sessions or client UI state |
| `backend/` | Legacy/demo HTTP API, identity, authorization, workflows, and central persistence | Mobile inference implementation |
| `web-frontend/` | Legacy/demo browser UI and API integration | Server-side business or authorization rules |

These folders are independently buildable. A developer should be able to change one module without editing another unless an explicit API, model, or label-map contract changes.

## Backend change path

Use this dependency direction for backend behavior:

```text
Route -> middleware / FormRequest -> controller -> service -> repository interface -> repository -> model
```

- Routes and middleware own authentication and coarse role access.
- Policies own record-level access.
- Form requests own allow-list validation; global API middleware trims ordinary input and normalizes email identity values. Passwords are deliberately excluded from trimming.
- Controllers translate HTTP input and output but do not contain persistence queries.
- Services own business decisions. Pass configuration-dependent values into pure calculations when practical.
- Services depend on repository interfaces, so business workflows can be tested with doubles instead of a database.

## Test strategy

| Test type | Purpose | Database |
| --- | --- | --- |
| Backend unit (`composer test:unit`) | Pure business rules and model value behavior | None |
| Backend feature (`composer test:feature`) | Routes, middleware, policies, validation, persistence, and API contracts | In-memory SQLite only |
| Mobile Jest | Preprocessing and inference contracts | None |
| AI unittest | Scientific and artifact contracts | Temporary fixtures only |
| Web build | Production bundling and static integration errors | None |

A bug fix should first add the smallest test that reproduces the bug. Prefer a unit test for a service rule; use a feature test when the bug crosses an HTTP, authorization, validation, or persistence boundary.

## Security invariants

- All private API routes pass through `auth:sanctum`; role-specific workflows additionally pass through the single `role` middleware.
- Farmer diagnosis, inference, and synchronization routes require the farmer role. Admin and reviewer workflows have separate route groups.
- Record ownership remains enforced by policies even after a role check passes.
- The server uses validated fields rather than trusting client-provided ownership, role, file type, or model-class values.
- Email input is normalized once at the API boundary. Passwords and reset tokens are treated as opaque secrets.
- Authentication, public, authenticated, and synchronization endpoints use centralized rate-limit profiles.
- Clients may hide inaccessible screens for usability, but server authorization is always authoritative.

## Concurrent development workflow

The GitHub `Quality gates` workflow runs backend, web, mobile, and AI jobs independently and concurrently. Keep commits scoped to one module where possible, and call out cross-module contract changes in the pull request.

Before merging:

1. Run the checks for each changed module from the root README.
2. Add or update a regression test for changed behavior.
3. Confirm that no role, label-map, inference, or API contract changed unintentionally.
4. Keep generated artifacts, local databases, secrets, model files, and datasets out of commits.
