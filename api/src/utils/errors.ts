// Product Specification.md §15 — Error Taxonomy. `AppError` is the single
// carrier every route/service throws so the route layer can map it to
// `{ error: code, message }` with the right HTTP status, rather than each
// handler inventing its own shape.
export class AppError extends Error {
  statusCode: number;
  code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

// §15's "Geocoding (admin-facing, per POI)" table — code, meaning, and the
// admin-facing message this project surfaces for it. Frozen (including every
// nested entry) so a route can't accidentally mutate the shared taxonomy.
export const GEOCODING_ERROR_CODES = Object.freeze({
  ADDRESS_NOT_FOUND: Object.freeze({
    code: 'ADDRESS_NOT_FOUND',
    message: 'Provider found zero matches for this address. Manual correction needed.',
  }),
  ADDRESS_AMBIGUOUS: Object.freeze({
    code: 'ADDRESS_AMBIGUOUS',
    message: 'Multiple plausible matches were found for this address. Candidates are stored for admin selection.',
  }),
  LOW_CONFIDENCE_MATCH: Object.freeze({
    code: 'LOW_CONFIDENCE_MATCH',
    message: 'The best match for this address scored below the confidence threshold. Flagged for review and excluded from pack builds until resolved.',
  }),
  PROVIDER_ERROR: Object.freeze({
    code: 'PROVIDER_ERROR',
    message: 'The geocoding provider is temporarily unavailable. Retried automatically; please try again.',
  }),
});
