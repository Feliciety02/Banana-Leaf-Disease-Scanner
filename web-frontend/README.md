<div align="center">

# DahonMD Web Client

The React and Vite interface for farmers, agricultural reviewers, and administrators.

</div>

## Quick Start

Start the Laravel API first, then run these commands from `web-frontend/`:

```powershell
npm install
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
npm run dev -- --host 127.0.0.1 --port 4173
```

Open <http://127.0.0.1:4173>.

## Configuration

```dotenv
VITE_WEB_API_URL=http://127.0.0.1:8001/api
```

The browser communicates only with the shared Laravel backend. Restart Vite after changing `.env`.

## Experiences by Role

| Role | Main capabilities |
| --- | --- |
| Farmer | Scan, history, disease guide, profile, and review requests |
| Agricultural reviewer | Prioritized diagnosis review, content verification, and dataset candidates |
| Administrator | Overview analytics, users, diseases, diagnoses, settings, and model comparison |

## Image Upload Contract

Farmer uploads may be JPG/JPEG, PNG, or WEBP and must stay within the backend's 10 MB limit. Browser previews and MIME filters improve usability but do not replace server-side validation.

The final inference path must use the same contract as model evaluation:

```text
decoded image → normalized orientation → RGB → 224 × 224 → float32 [0, 1]
```

The file extension is not a model feature. Accuracy can still change with compression, phone processing, lighting, blur, framing, background, camera source, and disease stage. Deployment testing must use genuine farmer captures rather than converted copies of training files.

> [!NOTE]
> The normal classifier remains visibly marked as simulated until the validated production model and matching `label_map.json` are connected.

## Research Comparison

When the optional service is configured, the interface can show baseline and enhanced FP32 predictions side by side. This panel is thesis research only:

- it does not replace the normal screening result;
- it does not write to farmer history;
- it does not call the model with previously saved images automatically; and
- higher confidence on one photo does not establish better accuracy.

## Build Check

```powershell
npm run build
```

## Useful Paths

| Path | Purpose |
| --- | --- |
| `src/RoleApp.jsx` | Role-aware application shell and routes |
| `src/styles.css` | Shared visual system and responsive layout |
| `public/assets/disease-guide/` | Attributed educational disease images |
| `.env.example` | Local API configuration template |

Return to the [main project guide](../README.md) or read the [backend guide](../backend/README.md).
