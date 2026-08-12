# DahonMD Web API

Authoritative Laravel 12 + Sanctum API for both the React web and Expo mobile clients. It provides shared identities, public disease reading, authenticated profile and diagnosis operations, server-enforced farmer/agricultural-reviewer/admin roles, structured diagnosis and content-review audit records, prioritized review queues, manual research-dataset candidacy, AI–reviewer agreement analytics, admin account/content management, idempotent `/api/mobile/sync`, and validated image storage.

The `2026_08_12_000005_rename_user_role_to_farmer` migration converts existing legacy `user` role values to `farmer` without deleting accounts, tokens, or diagnoses. Its rollback restores the former value.

```powershell
php artisan migrate:fresh --seed
php artisan serve --host=0.0.0.0 --port=8001
```

Set `DEV_ADMIN_EMAIL`, `DEV_ADMIN_PASSWORD`, and optionally `DEV_ADMIN_NAME` before seeding to create the first development administrator. No administrator password is stored in source. Run tests with `php artisan test`. The authenticated `/api/inference` response remains a documented placeholder for the future Python model service.

## Image and Inference Boundary

`POST /api/inference` currently validates an image request up to 10 MB and returns a simulated result. Stored diagnosis images accept JPG/JPEG, PNG, and WEBP up to 10 MB. BMP is supported by the offline AI training decoder but is intentionally outside the stored diagnosis-image contract.

When the Python/TFLite inference service is connected, the backend must treat uploaded bytes as untrusted input: verify decodability and resource limits, do not trust the extension alone, and remove or neutralize unsafe metadata as appropriate. The service must use the same orientation, RGB, `224 x 224`, `[0, 1]`, quantization, and label-map contract used during evaluation.

PNG versus WEBP is not itself a class signal because the decoder supplies pixels to the model. Accuracy can still differ when compression or capture conditions change those pixels. Preserve the original prediction, model version, inference time, uncertainty/simulation state, and image provenance needed for later review. Never silently replace an original prediction with an agricultural review decision.

The five-entry `label_map.json` must travel with the deployed model. The API should not advertise real inference readiness merely because a label file exists; readiness also requires a validated model artifact, preprocessing compatibility, successful health checks, and deployment evaluation.

## Research Model Comparison

`POST /api/admin/model-comparison` is an administrator-only proxy for the separate baseline-versus-enhanced research runtime. It does not create a `diagnoses` row, so experimental runs never appear in farmer history. Leave `AI_COMPARISON_URL` empty until both validated TFLite models and their canonical label map are deployed behind a service that returns the documented comparison contract. The endpoint returns `503` while unconfigured rather than fabricating predictions.
