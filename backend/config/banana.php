<?php

return [
    'class_labels' => ['healthy', 'sigatoka', 'panama-disease', 'cordana-leaf-spot'],
    'confidence_threshold' => (float) env('AI_CONFIDENCE_THRESHOLD', 70),
    'model_version' => env('AI_MODEL_VERSION'),
    'input_size' => env('AI_INPUT_SIZE'),
    'ai_mode' => env('AI_MODE', 'SIMULATED / DEVELOPMENT'),
    'label_map_path' => env('AI_LABEL_MAP_PATH', dirname(__DIR__, 2).'/ai/artifacts/label_map.json'),
    'comparison_url' => env('AI_COMPARISON_URL'),
    'comparison_timeout_seconds' => (int) env('AI_COMPARISON_TIMEOUT_SECONDS', 60),
    'regulatory_review_months' => (int) env('REGULATORY_REVIEW_MONTHS', 6),
    'research_consent_version' => env('RESEARCH_CONSENT_VERSION', 'research-image-consent-v1'),
];
