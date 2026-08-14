# Scientific Content Governance and Review Workflow

## Current content gate

The working dataset now follows the five-class contract `healthy`, `dead`, `black-sigatoka`, `yellow-sigatoka`, and `cordana-leaf-spot`. Generic Sigatoka images without subtype provenance remain outside the training root pending expert review. A final trained `label_map.json` is still required before model-runtime readiness can be claimed.

Place the trained artifact's exact five-entry JSON label map at the configured `AI_LABEL_MAP_PATH`. The API accepts only keys `0` through `4`, five non-empty unique labels, and no extra classes. Disease drafts must use one of those exact values as `model_class_key`.

## Research dossier gate

For every confirmed disease class, prepare and validate a dossier before database insertion. It must document the accepted and alternative names, current causal-agent taxonomy and type, Philippine relevance, leaf-visible and non-leaf symptoms, spread, curative status, prevention, management, referral/reporting action, visual look-alikes, image-only limitations, evidence quality, and full source metadata. Non-disease visual classes such as Healthy and Dead leaf must explicitly omit pathogen claims and explain that the image class cannot establish a biological cause.

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

Uncertain results show retry guidance and no disease-specific management. Healthy output says only that no supported disease pattern was strongly detected. Dead leaf output describes a terminal visible condition and never assigns Moko disease or another cause. Farmer guidance comes only from verified records. All results retain the screening disclaimer and image-only limitations.
