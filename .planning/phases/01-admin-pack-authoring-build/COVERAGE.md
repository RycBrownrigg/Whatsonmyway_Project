# API Coverage — Smarty

> Full coverage by default. Opt-outs are explicit, reasoned decisions.
> Note: the automated API-coverage detector did not fire for this phase (the ROADMAP/CONTEXT text
> doesn't use its trigger vocabulary), but Phase 1 does integrate an external API (Smarty geocoding,
> per `Product Specification.md` §17 and ADMINPOI-01). This matrix was authored manually for that reason.

| capability | decision | reason |
|---|---|---|
| US Street Address API (single-address standardize + geocode) | INTEGRATE | Core requirement — spec §17, ADMINPOI-01, ADMINPOI-02 |
| US Address Autocomplete API | OPT-OUT | Not needed — admin form is free-text entry submitted to the single-address API on save, not live-suggest; not specified anywhere in the spec |
| US Address Batch/Bulk API | OPT-OUT | Not needed yet — Phase 1 is manual single-POI entry only. Revisit for Phase 6 (Import Pipeline), which processes many addresses at once |
| US ZIP Code API | OPT-OUT | Not needed — ZIP is admin-entered as part of the address, not derived from a separate lookup |
| International address APIs | OPT-OUT | Explicitly out of scope — spec is US-only (`address_state CHAR(2)`, no country field anywhere in the schema) |
| US Phone Validation API | OPT-OUT | Not needed — `phone` is a freeform optional field per spec §4, no validation API specified |
