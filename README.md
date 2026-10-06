# DahonMD — Banana Leaf Disease Scanner

> [!IMPORTANT]
> DahonMD is a screening and research tool, not laboratory confirmation. Model confidence is not the probability that a plant is diseased.

The Android app classifies a leaf photo on the phone, offline, as **Healthy**, **Sigatoka**, **Panama disease** or **Cordana leaf spot**. Accounts, sync, expert review and the website are optional.

When a signed-in farmer requests review, the agriculturist's final verdict
syncs into farmer history and appears in the admin record beside the original
AI result. A private photo can be shared for history and review; research use
requires separate consent. The optional web API records whether it can verify
a saved prediction with its own inference receipt. Phone results remain
client-reported to that API even when the on-device model ran successfully.

All commands use **Windows PowerShell** from the project folder.

---

## 🚀 Quick start: website + phone test link

```powershell
Set-Location 'C:\Users\feann\OneDrive\Documents\Banana-Leaf-Disease-Scanner'
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\start-free-test.ps1
```

Starts the test backend and website. With a USB-debugging phone connected, it installs the app and connects it directly through USB. Without a phone, it opens a free Cloudflare HTTPS link:

- **Website** opens in your browser; the link is also copied to the clipboard.
- **Phone on USB** (USB debugging on): installs/updates the APK and opens it with the new link.
- **No phone plugged in**: a QR code opens on screen. Scan it with the phone camera and tap **Open DahonMD app**. (Or open `<link>/connect.html` in the phone browser.)

| Command | What it does |
| --- | --- |
| `.\start-free-test.ps1` | Start or restart; use USB when a phone is connected, otherwise Cloudflare |
| `.\start-free-test.ps1 -Stop` | Stop the tunnel, website and backend |
| `.\start-free-test.ps1 -NoOpen` | Don't open the browser or QR code |
| `.\start-free-test.ps1 -SkipPhone` | Website only; don't touch the phone |
| `.\start-free-test.ps1 -ForceApkBuild` | Rebuild the APK even if mobile code is unchanged |
| `.\start-free-test.ps1 -UsbOnly` | Connect a USB-debugging phone directly when Cloudflare is unavailable |
| `.\start-free-test.ps1 -Cloudflare` | Request a public Cloudflare link even when a USB phone is connected |

### USB phone connection (no Cloudflare)

Keep the phone unlocked with USB debugging authorized, then run the quick start command above. To require USB mode explicitly, run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\start-free-test.ps1 -UsbOnly
```

The script builds a test APK, installs it, creates an ADB reverse connection,
and sends `http://127.0.0.1:4174` to the app. Wait for **Server connected** on
the phone and sign in again. Keep the USB cable attached while using connected
features; offline scanning still works after disconnecting. This loopback HTTP
address is accepted only by the USB test APK built by this command.

### Restart Cloudflare (new link)

The free link changes every run and stops working once the tunnel stops. The
app signs out when the server address changes, so sign in again after the phone
shows **Server connected**. To get a new link:

```powershell
.\start-free-test.ps1 -Stop
.\start-free-test.ps1 -Cloudflare
```

Wait for `Website and phone server: https://…` before using the phone. If a port (8002 or 4174) is still busy, find it with:

```powershell
Get-NetTCPConnection -LocalPort 8002,4174 -State Listen | Select-Object LocalPort, OwningProcess
```

The script retries Cloudflare over HTTP/2 and QUIC, waits for a registered
tunnel connection, then checks the public API before handing the link to the
phone. If all attempts fail, check `tunnel-*.err.log` under `.dahonmd\free-test\`
and retry when the network can reach Cloudflare.

Test data lives in `.dahonmd\free-test\` and is kept between runs. The script
applies pending backend migrations to that isolated database at startup. Emails
are only written to the log. Keep the computer on while using the link.

---

## 📱 Android app (development)

First time:

```powershell
cd mobile-frontend
npm install
npm run release:status                          # checks the bundled model
npx expo prebuild --clean --platform android
npm run android
```

Next time:

```powershell
cd mobile-frontend
npm run android
```

Needs Node.js 22.13+, and an emulator or a phone with USB debugging. **Expo Go won't work**: it can't load the custom on-device model module.

Rebuild after an Expo upgrade or native config change: `npm install`, `npx expo prebuild --clean --platform android`, then `npm run android`.

### Build a shareable APK

```powershell
cd mobile-frontend\android
.\gradlew.bat assembleRelease
```

Output: `mobile-frontend\android\app\build\outputs\apk\release\app-release.apk` (debug-signed; for testing and demos, not the Play Store).

---

## 🌐 Website + API (local demo)

**With Docker:**

```powershell
docker compose up --build     # first time
docker compose up             # next time
docker compose down           # stop
```

Open http://localhost:4173.

**Without Docker** (PHP 8.2+, Composer, Node.js). First time:

```powershell
cd backend
composer install
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
php artisan key:generate
if (-not (Test-Path database/database.sqlite)) { New-Item database/database.sqlite -ItemType File }
php artisan migrate --seed
```

Then run in two terminals:

```powershell
# Terminal 1 — API
cd backend
php artisan serve --host=0.0.0.0 --port=8001
```

```powershell
# Terminal 2 — website
cd web-frontend
npm install
npm run dev -- --host 127.0.0.1 --port 4173
```

Open http://127.0.0.1:4173. Don't run Docker and this at the same time (both use port 8001).

### Demo accounts

Created by `php artisan migrate --seed` (not in production). Password: `DahonMD@2026` (or `DEV_USER_PASSWORD`).

| Email | Role |
| --- | --- |
| `admin@dahonmd.test` | Administrator |
| `agriculturist@dahonmd.test` | Agriculturist |
| `maria.santos@dahonmd.test` | Farmer |

---

## 🤖 AI

```powershell
# Optional model-comparison service (thesis comparison panel only)
.venv\Scripts\python.exe -m uvicorn ai.deployment.comparison_service:app --host 127.0.0.1 --port 8100
```

Deployed model: `ca_mobilenetv3_small_fp32.tflite` (PILOT-06 seed 42, locked-test macro-F1 **0.96645**, accuracy **0.96644**). Setup, training and pilot history: [AI guide](ai/README.md), [GPU training guide](ai/training/GPU_TRAINING_GUIDE.md), [experiment roadmap](MODEL_EXPERIMENTS.md).

---

## ✅ Tests

```powershell
cd backend; php artisan test; cd ..            # backend
npm --prefix web-frontend run build             # website
npm --prefix mobile-frontend test               # mobile
npm --prefix mobile-frontend run typecheck
.venv\Scripts\python.exe -m unittest discover -s ai\tests -v   # AI
```

---

## 🧯 Common problems

| Problem | Fix |
| --- | --- |
| `.\start-free-test.ps1` "running scripts is disabled" | Run `Set-ExecutionPolicy -Scope Process Bypass` first |
| Phone says "request could not be completed" | The link changed. Restart Cloudflare (above) and reconnect the phone |
| Port already in use | Stop the other process using it, or run `.\start-free-test.ps1 -Stop` |
| Expo Go opens but can't classify | Expected; use `npm run android` |
| No Android device found | Start an emulator or plug in a phone with USB debugging |
| Website says `Failed to fetch` | Check the API is running and only one of Docker / local servers is on |

---

## 📂 Project layout

| Folder | What's inside |
| --- | --- |
| [`mobile-frontend/`](mobile-frontend/README.md) | Android app (Expo / React Native, on-device TFLite) |
| [`web-frontend/`](web-frontend/README.md) | Website (React / Vite) |
| [`backend/`](backend/README.md) | API and database (Laravel, SQLite) |
| [`ai/`](ai/README.md) | Training, evaluation and model conversion |
| [`datasets/`](datasets/README.md) | Four-class dataset workspace |
| `docs/` | [Architecture](docs/architecture/overview.md), [quality attributes](docs/architecture/quality-attributes.md), [content governance](docs/research/scientific-content-governance.md), [dataset/model checklist](docs/research/dataset-model-trainer-checklist.md) |

## 🧬 Scientific limits

- `sigatoka` covers Black and Yellow Sigatoka; the model doesn't tell them apart.
- `healthy` is not proof a plant is disease-free; Panama disease needs field or lab confirmation.
- Chemical advice is shown only with current Philippine regulatory evidence.
