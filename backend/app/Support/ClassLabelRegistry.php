<?php

namespace App\Support;

use Illuminate\Support\Facades\File;

class ClassLabelRegistry
{
    public function labels(): array
    {
        $path = config('banana.label_map_path');
        if (! $path || ! File::isFile($path)) {
            return [];
        }

        $decoded = json_decode(File::get($path), true);
        if (! is_array($decoded) || count($decoded) !== 5) {
            return [];
        }

        ksort($decoded, SORT_NUMERIC);
        $expected = ['0', '1', '2', '3', '4'];
        if (array_map('strval', array_keys($decoded)) !== $expected) {
            return [];
        }

        $labels = array_values($decoded);
        $expectedLabels = config('banana.class_labels', []);

        return count(array_unique($labels)) === 5
            && collect($labels)->every(fn ($label) => is_string($label) && trim($label) !== '')
            && $labels === $expectedLabels
            ? $labels
            : [];
    }

    public function isEstablished(): bool
    {
        return count($this->labels()) === 5;
    }
}
