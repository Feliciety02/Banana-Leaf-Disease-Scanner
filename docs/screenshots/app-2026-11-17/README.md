# DahonMD phone capture · 17 November 2026

Unedited screenshots of the installed DahonMD Android app for each role, used in the [project README](../../../README.md#app-tour).

## Capture details

| Item | Value |
| --- | --- |
| Device | realme 7 (RMX2151), Android 12 |
| Screen | 1080 × 2400 |
| App | `com.dahonmd.field` 1.0.0, test APK built from branch `feature/farmer-flow-and-review-loop` (commit `fc87827`) and installed on 17 November 2026 |
| Server | Local test backend from `start-free-test.ps1 -UsbOnly`, reached through ADB reverse |
| Accounts | Seeded demo accounts: farmer `maria.santos@dahonmd.test`, agriculturist `agriculturist@dahonmd.test`, administrator `admin@dahonmd.test` |
| Method | `adb exec-out screencap -p` over USB debugging; navigation by `adb shell input tap` and `input swipe` |
| Processing | PNG converted to **lossless** WebP with Pillow; decoded pixels verified identical to the PNG capture |

Nothing was cropped, retouched, or composited. The status bar shows the phone's real notification icons at the time of capture. No review, approval, or account change was submitted while capturing.

The demo farmer account uses a personal photo as its profile picture, so screens that show it were left out: the farmer Account tab, the top of the agriculturist review sheet (the scrolled view is used instead), and the administrator's Farmers list (the Agriculturists list is used instead).

## Files

### Farmer

| File | Screen | SHA-256 |
| --- | --- | --- |
| `farmer/01-home.webp` | Home: scan prompt, saved scans, review notice | `66f4ef6fa8f4baa9cbc65da5b53b5219303c2e24c26566f239fc0a7351309542` |
| `farmer/02-scan.webp` | Scan: camera or gallery photo | `b8a2e709c6c3f7658e65c795132af6f157c6974bff73c725282aa795b1af8e5d` |
| `farmer/03-history.webp` | Scan History: results and send status | `58b8a77f827ec3060f722521e79a94617d6c25eaf84fbe068997c2ec61604f01` |
| `farmer/04-expert-review.webp` | Completed expert review with the agriculturist's message | `1fcd9d368c60b218af293094ed036cf682bf17d237fbd5dd9253bafbd4f4020f` |
| `farmer/05-guide.webp` | Guide: leaf conditions the scan can check | `0db50ba8523e9c848ef8231b6ece22445258062044c8c6f436f0b5e967cda86e` |
| `farmer/06-library.webp` | Guide Library: offline articles | `44fe2df0fa3eb214b289e4efd1d1b9519e6fb71453cc9b21f878490546c17ec9` |
| `farmer/07-sign-in.webp` | Account tab when signed out | `e66301dc4b683a2905c8defba1df6b0079ac2d27a090e50739ddd835a2cef3b2` |
| `farmer/08-ask-dahon.webp` | Ask Dahon: general guidance chat | `89a341eb9769809d973b8b18561c1c1e3eb3b34f13168271411bff6de41bdb63` |

### Agriculturist

| File | Screen | SHA-256 |
| --- | --- | --- |
| `agriculturist/01-review-requests.webp` | Home: scans waiting for review | `15070caf43dd4d8ca2fa61e41637825d47f525a85931b9384fc0cb90fb25c833` |
| `agriculturist/02-review-scan.webp` | Review sheet: farmer's note and assessment options | `c598a33854dd7aa6780968581be56d1e3191d49086cdf5e7b10f9a5feae4cfe2` |
| `agriculturist/03-reviewed.webp` | Reviewed scans | `06dc2244c0c6cd69045a1f7e7b8fe0b02f5c25e0c9e7bfbbff431d50289d7aae` |
| `agriculturist/04-disease-records.webp` | Content review: disease records | `85b1cf44d1984d338eff2bccdc04d3f76cbeca0638eafd08b2561dee364b7b78` |
| `agriculturist/05-dataset-candidates.webp` | Content review: dataset candidates | `11509133f581ab5c07c69e98ee0f24420ccac382a7f5a31e2124bcd5816c7e68` |
| `agriculturist/06-account.webp` | Account | `eeedcb5105151c5a9bfd8d2e2b09c4672e62b0d39207d7eb27033cfd751832d4` |

### Administrator

| File | Screen | SHA-256 |
| --- | --- | --- |
| `admin/01-overview.webp` | Home: system overview | `03c5601392c07c879c1a0db60712e0e60c31f12320b2451b535e6d9e43fbac78` |
| `admin/02-accounts.webp` | Accounts: agriculturists | `0764d56138f1a9d43adbc7571148e492ef67009ac5ec8cb1d96f219cf8c3e653` |
| `admin/03-diagnoses.webp` | Scans: diagnoses with filters | `9ccce248c9ddc5c595095dd710dea2bd3b1878385dda2ee0899a777981663e97` |
| `admin/04-disease-knowledge.webp` | Knowledge: disease records | `19b9f9c870829a8f3da6278f8263c542737b3f0cbf9ae7b21a2544979b4f78b7` |
| `admin/05-articles.webp` | Knowledge: articles | `75dbc828ebb0f2267a666c0fa839b4bed56b82286dc0fbe4cad0372c031fb609` |
| `admin/06-account.webp` | Account | `7ba7adae67f1def1dc1572310b448df8328ac519abb228343fb348de77ad8835` |

Check a hash in PowerShell with `Get-FileHash .\farmer\01-home.webp -Algorithm SHA256`.
