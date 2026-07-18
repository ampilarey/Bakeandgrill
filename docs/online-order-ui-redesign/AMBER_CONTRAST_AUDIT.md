# Amber CTA contrast audit (Phase 1)

**Date:** 2026-07-18  
**Spec:** REDESIGN_PLAN §8.1 / §26

## Finding

| Pair | Approx contrast | AA normal text (4.5:1) | AA large text (3:1) |
|------|-----------------|------------------------|---------------------|
| White `#FFFFFF` on `--color-primary` `#D4813A` | ~3.2:1 | Fail | Pass if ≥18.66px **and** bold (≥700) |
| White on `--color-primary-hover` `#B86820` | ~4.6:1 | Pass | Pass |
| `--color-primary` on `--color-bg` / white | ≥4.5:1 | Pass (text on cream) | Pass |

## Rule encoded in UI

Primary filled CTAs (`Button` variant `primary`, `.btn-cta-primary`, `.sticky-cta-bar__btn`):

1. **Label size ≥ 1.125rem (18px)** and **font-weight ≥ 700**, **or**
2. Background uses `--color-primary-hover` (`#B86820`) when the label must stay smaller.

Phase 1 encodes (1) on `Button` primary and sticky CTA styles. Secondary/ghost variants keep amber-on-light fills (those pairs already pass).

Dark theme primary `#e09242` on dark surfaces is re-checked in Phase 7 with the full §26 audit.
