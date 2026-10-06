<?php

return [
    'class_labels' => ['healthy', 'sigatoka', 'panama-disease', 'cordana-leaf-spot'],
    'confidence_threshold' => (float) env('AI_CONFIDENCE_THRESHOLD', 70),
    // Farmer review requests waiting longer than this are flagged on the admin dashboard.
    'review_overdue_days' => (int) env('REVIEW_OVERDUE_DAYS', 3),
    'model_version' => env('AI_MODEL_VERSION'),
    'input_size' => env('AI_INPUT_SIZE'),
    'ai_mode' => env('AI_MODE', 'SIMULATED / DEVELOPMENT'),
    // Output order of the deployed four-class model (matches ai/config/labels.py
    // and the Android native module). An empty AI_LABEL_MAP_PATH falls back to
    // the tracked copy instead of disabling the label map.
    'label_map_path' => env('AI_LABEL_MAP_PATH') ?: resource_path('models/label_map.json'),
    'comparison_url' => env('AI_COMPARISON_URL'),
    'comparison_timeout_seconds' => (int) env('AI_COMPARISON_TIMEOUT_SECONDS', 60),
    'regulatory_review_months' => (int) env('REGULATORY_REVIEW_MONTHS', 6),
    // Sharing actions (review requests, image uploads, research consent and
    // staff workspaces) require a verified email address when enabled.
    'require_verified_email' => (bool) env('REQUIRE_VERIFIED_EMAIL', true),
    // How long a signed scan-photo URL stays valid. Signed-in apps can still
    // load an older URL with their own session or token.
    'media_url_ttl_minutes' => (int) env('MEDIA_URL_TTL_MINUTES', 120),
    'research_consent_version' => env('RESEARCH_CONSENT_VERSION', 'research-image-consent-v2'),
];
