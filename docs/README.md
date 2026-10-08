# DahonMD Documentation

Current guidance and historical evidence are separated below.

## Current Documentation

| Area | Document |
| --- | --- |
| Runtime and repository boundary | [Architecture overview](architecture/overview.md) |
| Engineering constraints | [Quality attributes](architecture/quality-attributes.md) |
| Current role flows | [Flow guide](diagrams/ROLE_USER_FLOWS.md), [detailed journeys](diagrams/ROLE_JOURNEY_DETAILS.md), and [editable draw.io](diagrams/dahonmd-role-user-flows-2026-10-07.drawio) |
| Historical dataset and model checklist | [Dataset/model trainer checklist](research/dataset-model-trainer-checklist.md) |
| Scientific content review | [Scientific content governance](research/scientific-content-governance.md) |
| Thesis source-contract status | [Thesis compliance](research/thesis-compliance.md) |
| Legacy Docker workflow | [Legacy stack setup](getting-started/legacy-stack.md) |

Component-specific setup remains beside each component:

- [Mobile application guide](../mobile-frontend/README.md)
- [AI pipeline guide](../ai/README.md)
- [Dataset guide](../datasets/README.md)
- [Legacy backend guide](../backend/README.md)
- [Legacy web guide](../web-frontend/README.md)

## Archive

Files under `archive/` are dated audits or historical migration records. They
may contain old paths, test counts, or runtime assumptions and must not override
the current architecture overview.

- [Dated audits](archive/audits/)
- [Historical documents](archive/historical-documents/)
