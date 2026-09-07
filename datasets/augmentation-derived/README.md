# Inactive Augmentation Archive

This directory is outside `banana_leaf_thesis_4class/` and is not an active
training, validation, or test input.

`cordana-ecuador/` contains 3,000 source-provided Cordana derivatives (ten per
300 source parents). They are preserved for provenance, not counted as
independent samples, and must never be used in validation or test data. Prefer
runtime augmentation generated from the frozen training partition.
