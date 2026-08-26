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
        $expectedLabels = config('banana.class_labels', []);
        $classCount = count($expectedLabels);
        if (! is_array($decoded) || count($decoded) !== $classCount) {
            return [];
        }

        ksort($decoded, SORT_NUMERIC);
        $expected = array_map('strval', range(0, $classCount - 1));
        if (array_map('strval', array_keys($decoded)) !== $expected) {
            return [];
        }

        $labels = array_values($decoded);
        return count(array_unique($labels)) === $classCount
            && collect($labels)->every(fn ($label) => is_string($label) && trim($label) !== '')
            && $labels === $expectedLabels
            ? $labels
            : [];
    }

    public function isEstablished(): bool
    {
        $expectedCount = count(config('banana.class_labels', []));

        return $expectedCount > 0 && count($this->labels()) === $expectedCount;
    }
}
