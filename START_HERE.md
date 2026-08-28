# DahonMD — Start Here

Use this page to choose the correct part of the repository.

| I want to… | Open |
| --- | --- |
| Build or change the Android thesis classifier | [`mobile-frontend/`](mobile-frontend/README.md) |
| Train, evaluate, or export the model | [`ai/`](ai/README.md) |
| Validate images, metadata, reviews, cohorts, or splits | [`datasets/`](datasets/README.md) |
| Read current architecture and research guidance | [`docs/`](docs/README.md) |
| Work on the old server-backed demonstration | [`backend/`](backend/README.md) and [`web-frontend/`](web-frontend/README.md) |

The production thesis path is:

```text
mobile-frontend/index.ts
  -> src/app/App.tsx
  -> src/features/classification/
  -> modules/dahonmd-tflite/
  -> local four-class INT8 inference
```

Do not connect authentication, HTTP inference, synchronization, SQLite history,
or the legacy web/backend stack to this path.

Generated folders and files such as `ai/artifacts/`, dependency/build folders,
Gradle caches, and `dahonmd_colab_code.zip` are not source-of-truth code.
