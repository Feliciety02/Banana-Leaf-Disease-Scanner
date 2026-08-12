<?php

return [
    'confidence_threshold' => (float) env('AI_CONFIDENCE_THRESHOLD', 70),
    'model_version' => env('AI_MODEL_VERSION'),
    'input_size' => env('AI_INPUT_SIZE'),
    'ai_mode' => env('AI_MODE', 'SIMULATED / DEVELOPMENT'),
    'label_map_path' => env('AI_LABEL_MAP_PATH', dirname(__DIR__, 2).'/ai/artifacts/label_map.json'),
    'regulatory_review_months' => (int) env('REGULATORY_REVIEW_MONTHS', 6),
];
