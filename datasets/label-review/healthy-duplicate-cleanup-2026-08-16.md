# Healthy Exact-Duplicate Cleanup — 2026-08-16

The repository-wide SHA-256 scan found 107 unique Healthy images repeated in
five filename batches: `fg`, `fk`, `fresh`, `ft`, and `fy`. Every file in the
four parenthesized batches was byte-identical to one file in the simpler
`fresh1.jpg` through `fresh107.jpg` batch.

- Retained in active training: 107 `fresh*.jpg` files
- Moved out of active training: 428 exact copies
- Quarantine: `exact-duplicates/healthy-incoming-2026-08-16/`
- Data removed permanently: none

After the later three-file malformed Sigatoka quarantine, the complete
then-current five-class training root contained 877 images and 877 distinct SHA-256 hashes.
