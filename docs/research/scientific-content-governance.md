# Scientific Content Governance and Review Workflow

## Current content gate

The thesis model now follows the four-class contract `healthy`, `sigatoka`,
`panama-disease`, and `cordana-leaf-spot`. The `sigatoka` class
combines Black- and Yellow-source presentations and does not claim subtype
identification. Generic Sigatoka images without sufficient provenance remain
outside the training root pending expert review. The Panama training folder has
42 readable source-labeled leaf candidates, but agricultural-expert review and
scientific content verification remain outstanding. The current FP32 student
artifact is trained and bundled under the four-class contract; these remaining
source-label and content checks must not be presented as completed expert
validation of the field images.

The deployed model's four-entry JSON label map is tracked at
`backend/resources/models/label_map.json` and used by default; set
`AI_LABEL_MAP_PATH` only to point at a different retrained artifact's map. The
API accepts only keys `0` through `3` in the canonical
order above, four non-empty unique labels, and no extra classes. A stale map
containing `black-sigatoka` or `yellow-sigatoka` is rejected. Disease drafts
must use one of the canonical values as `model_class_key`.

## Research dossier gate

For every confirmed disease class, prepare and validate a dossier before database insertion. It must document the accepted and alternative names, current causal-agent taxonomy and type, Philippine relevance, leaf-visible and non-leaf symptoms, spread, curative status, prevention, management, referral/reporting action, visual look-alikes, image-only limitations, evidence quality, and full source metadata. Non-disease visual classes such as Healthy must explicitly omit pathogen claims and explain that the image class cannot establish a biological cause.

The evidence target is at least two peer-reviewed sources, one authoritative agricultural/institutional source, and a Philippines-specific source where available. Foundational biological evidence must be distinguished from current management or regulatory guidance. Source disagreement is stored in evidence notes rather than silently removed.

## Verification lifecycle

- `draft`: incomplete research or authoring; never public.
- `researched`: dossier/content entered and awaiting source validation; never public.
- `verified`: verification rules passed and an administrator recorded the review; farmer-visible.
- `archived`: retained for audit but no longer public.

Any edit to a verified disease, mapped claim, symptom, management item, or source returns affected content to `researched`. Verification checks source quality, required claim mappings, and chemical-regulatory freshness.

## Chemical and regulatory rule

All chemical management items must set `regulatory_check_required`. They remain excluded from farmer responses until `regulatory_checked_at` is present and within the configured review interval. A research paper demonstrating efficacy does not establish legal registration for banana, the target disease, or the Philippines. Current FPA registration and label directions must be checked separately and recorded as regulatory evidence.

## Public result rule

Uncertain results show retry guidance and no disease-specific management. Healthy output says only that no supported disease pattern was strongly detected. Farmer guidance comes only from verified records. All results retain the screening disclaimer and image-only limitations.

## Connected agricultural review and research images

The original AI result stays visible and unchanged. An agriculturist records a
separate current verdict, farmer-facing message, image quality, and next steps.
The verdict syncs to the farmer and appears in the administrator's diagnosis
view. Internal notes and revision history are staff-only. A reviewer saving an
assessment supplies the version they opened; changing a completed assessment
requires a reason and preserves the previous version. An approved dataset
candidate locks later review revisions.

A private photo may be uploaded for shared history and review without research
consent. Research nomination requires a retained photo, active consent, and a
completed review. Approval additionally requires a current `confirmed` or
`alternate_class` verdict and `good` image quality. The approver cannot be the
nominator. Consent withdrawal blocks approval while consent is inactive;
farmer follow-up marks an unapproved candidate `uncertain`. Approval creates a
separate private research copy and locks later review edits. Deleting the scan
or account does not remove that copy by default. Farmers can revoke consent
while signed in, including after deleting the scan; account deletion offers
an option to remove every approved copy. Staff can remove a copy with a recorded
reason. Revocation marks the candidate rejected and deletes the private file,
while retaining the audit record. The new copy requires consent version `v2`;
older consent must be renewed. Approval is an intake decision, not automatic
inclusion in a training set.
