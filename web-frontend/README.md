<div align="center">

# DahonMD Web Client

The React and Vite interface for farmers, agricultural reviewers, and administrators.

</div>

## Start Here

Use this folder when your task involves browser pages, forms, dashboards, responsive styles, or the farmer/reviewer/admin web experience.

Before starting, make sure:

- Node.js and npm are installed;
- the Laravel API is running on port `8001`; and
- your terminal is open in the main DahonMD repository.

## Quick Start

### 1. Open the web folder

```powershell
cd web-frontend
```

### 2. Install packages

```powershell
npm install
```

### 3. Create local settings

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

### 4. Start the website

```powershell
npm run dev -- --host 127.0.0.1 --port 4173
```

Leave the terminal open, then visit <http://127.0.0.1:4173>.

You know it worked when the DahonMD sign-in screen loads without an API connection warning.

For later runs, only use:

```powershell
cd web-frontend
npm run dev -- --host 127.0.0.1 --port 4173
```

## Configuration

```dotenv
VITE_WEB_API_URL=/api
```

The browser uses the same-origin `/api` path. During development, Vite proxies it to Laravel at `http://127.0.0.1:8001`; Docker's Nginx proxy handles the same path in a container. Restart Vite after changing `.env`.

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

A successful build ends without an error and creates the ignored `dist/` folder.

Run this check before submitting web changes.

## Common Problems

| Problem | What to do |
| --- | --- |
| `npm` is not recognized | Install Node.js, reopen PowerShell, and run `npm --version`. |
| The page cannot load data | Start the Laravel API and verify `VITE_WEB_API_URL`. |
| Port 4173 is already in use | Stop the other Vite terminal with `Ctrl+C`. |
| An `.env` change is ignored | Stop Vite and start it again. |
| The page looks outdated | Refresh the browser; if needed, restart Vite. |
| `npm run build` fails | Read the first error shown, fix it, and rerun the command. |

## Useful Paths

| Path | Purpose |
| --- | --- |
| `src/RoleApp.jsx` | Role-aware application shell and routes |
| `src/styles.css` | Shared visual system and responsive layout |
| `public/assets/disease-guide/` | Attributed educational disease images |
| `.env.example` | Local API configuration template |

## Safe Student Workflow

1. Start the API and web client.
2. Sign in with the role related to your task.
3. Make one focused interface change.
4. Check narrow mobile and wide desktop layouts.
5. Test loading, empty, success, and error states.
6. Run `npm run build` before handing off the change.

Return to the [main project guide](../README.md) or read the [backend guide](../backend/README.md).
