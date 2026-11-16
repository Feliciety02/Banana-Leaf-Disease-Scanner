# DahonMD phone capture · 17 November 2026

Unedited screenshots of the installed DahonMD Android app, used in the [project README](../../../README.md#app-tour).

## Capture details

| Item | Value |
| --- | --- |
| Device | realme 7 (RMX2151), Android 12 |
| Screen | 1080 × 2400 |
| App | `com.dahonmd.field` 1.0.0, test APK built from branch `feature/farmer-flow-and-review-loop` (commit `fc87827`) and installed on 17 November 2026 |
| Server | Local test backend from `start-free-test.ps1 -UsbOnly`, reached through ADB reverse |
| Account | Seeded demo farmer `maria.santos@dahonmd.test`; the expert review is seeded demo data |
| Method | `adb exec-out screencap -p` over USB debugging; navigation by `adb shell input tap` and `input swipe` |
| Processing | PNG converted to **lossless** WebP with Pillow; decoded pixels verified identical to the PNG capture |

Nothing was cropped, retouched, or composited. The status bar shows the phone's real notification icons at the time of capture.

The signed-in Account screen was not included because its profile picture is a personal photo.

## Files

| File | Screen | SHA-256 |
| --- | --- | --- |
| `01-home.webp` | Home: scan prompt, saved scans, review notice | `66f4ef6fa8f4baa9cbc65da5b53b5219303c2e24c26566f239fc0a7351309542` |
| `02-scan.webp` | Scan: camera or gallery photo | `b8a2e709c6c3f7658e65c795132af6f157c6974bff73c725282aa795b1af8e5d` |
| `03-history.webp` | Scan History: results and send status | `58b8a77f827ec3060f722521e79a94617d6c25eaf84fbe068997c2ec61604f01` |
| `04-expert-review.webp` | Completed expert review with the agriculturist's message | `1fcd9d368c60b218af293094ed036cf682bf17d237fbd5dd9253bafbd4f4020f` |
| `05-guide.webp` | Guide: leaf conditions the scan can check | `0db50ba8523e9c848ef8231b6ece22445258062044c8c6f436f0b5e967cda86e` |
| `06-library.webp` | Guide Library: offline articles | `44fe2df0fa3eb214b289e4efd1d1b9519e6fb71453cc9b21f878490546c17ec9` |
| `07-sign-in.webp` | Account tab when signed out | `e66301dc4b683a2905c8defba1df6b0079ac2d27a090e50739ddd835a2cef3b2` |
| `08-ask-dahon.webp` | Ask Dahon: general guidance chat | `89a341eb9769809d973b8b18561c1c1e3eb3b34f13168271411bff6de41bdb63` |

Check a hash in PowerShell with `Get-FileHash .\01-home.webp -Algorithm SHA256`.
