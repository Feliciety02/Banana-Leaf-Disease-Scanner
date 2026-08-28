# DahonMD

DahonMD is a thesis Android application for stateless, on-device classification
of supported banana leaf conditions. The repository also contains the active
machine-learning research pipeline, dataset workspace, and a separate legacy
Laravel/React demonstration stack.

**Course:** CCE 106L – Applications Development and Emerging Technologies

| Member | Role |
| --- | --- |
| Fe Anne Malasarte | Student |
| Jay Mark Burlado | Student |
| Joevan Capote | Student |
| John Benedict Bongcac | Student |

> [!IMPORTANT]
> DahonMD is a screening and research system, not laboratory confirmation.
> Model confidence is not the biological probability that a plant has a disease.

## Start Here

New contributors should open [START_HERE.md](START_HERE.md). It identifies the
correct folder for application, ML, dataset, documentation, and legacy work.

## Active Thesis Runtime

```text
camera or gallery image
  -> deterministic 224 x 224 RGB preparation
  -> native TensorFlow Lite
  -> full-integer INT8 CA-MobileNetV3-Small
  -> one four-class result + relative confidence
```

The fixed classes are:

1. Healthy
2. Sigatoka
3. Panama Disease
4. Cordana Leaf Spot

The active mobile runtime has no authentication, backend inference, Internet
requirement, synchronization, scan history, or classification database.

> [!WARNING]
> The final validated model file is not currently bundled at
> `mobile-frontend/assets/models/ca_mobilenetv3_small_int8.tflite`. Source-level
> checks can pass while release readiness remains blocked by this missing artifact.

## Repository Map

| Path | Classification | Purpose |
| --- | --- | --- |
| [`mobile-frontend/`](mobile-frontend/README.md) | **ACTIVE THESIS** | Expo Android interface, preprocessing, native TFLite bridge, and device benchmarks |
| [`ai/`](ai/README.md) | **ACTIVE RESEARCH** | Dataset validation, model training, evaluation, and TFLite export tooling |
| [`datasets/`](datasets/README.md) | **DATASET WORKSPACE** | Source images, metadata, review queues, cohorts, splits, and data-governance instructions |
| [`docs/`](docs/README.md) | **DOCUMENTATION** | Current architecture/research documents and archived audits |
| [`backend/`](backend/README.md) | **LEGACY / DEMO** | Laravel API and relational persistence for the separate demo workflow |
| [`web-frontend/`](web-frontend/README.md) | **LEGACY / DEMO** | React role/account/history interface for the separate demo workflow |
| `ai/artifacts/`, `**/dist/`, `**/.gradle/`, `dahonmd_colab_code.zip` | **GENERATED** | Ignored reproducible outputs and local build artifacts |

The legacy applications remain at their existing root paths because Compose,
CI, documentation, and deployment configuration refer to them. They are not
dependencies of the active thesis application.

## Component Guides

- Mobile setup and checks: [mobile-frontend/README.md](mobile-frontend/README.md)
- AI workflow: [ai/README.md](ai/README.md)
- Dataset workflow: [datasets/README.md](datasets/README.md)
- Legacy Docker stack: [docs/getting-started/legacy-stack.md](docs/getting-started/legacy-stack.md)
- Architecture boundary: [docs/architecture/overview.md](docs/architecture/overview.md)

## Quality Checks

Run checks from the repository root unless a command changes directory:

```powershell
# Mobile
cd mobile-frontend
npm test
npm run typecheck
npm run release:status

# AI (from the repository root)
cd ..
.venv\Scripts\python.exe -m unittest discover -s ai/tests -v

# Legacy backend
cd backend
composer quality

# Legacy web
cd ..\web-frontend
npm run build
```

Only report release success after the final INT8 model is bundled and verified
on Android hardware with the backend and network unavailable.

## Scientific Boundaries

- `sigatoka` combines Black- and Yellow-source presentations; they are not separate output classes.
- Panama Disease output is not laboratory confirmation of Fusarium or Foc infection.
- Source images, expert review, cohort membership, frozen splits, and experimental results must not be altered during repository maintenance.
