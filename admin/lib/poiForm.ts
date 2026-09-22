import { z } from 'zod';
import type { PackFieldDefinition } from './api';

// The fixed (non-pack-specific) address block shared by the Add POI (new)
// and edit screens (plan 01-04's "one control set" requirement).
export const POI_FIXED_SCHEMA = z.object({
  name: z.string().min(1, 'Name is required.'),
  addressStreet: z.string().min(1, 'Street is required.'),
  addressCity: z.string().min(1, 'City is required.'),
  addressState: z.string().length(2, 'Use the 2-letter state code.'),
  addressZip: z.string().min(1, 'ZIP is required.'),
  phone: z.string().optional(),
  website: z.string().url('Enter a valid URL.').optional().or(z.literal('')),
  additionalInfo: z.string().optional(),
});

export type PoiFixedFormValues = z.infer<typeof POI_FIXED_SCHEMA>;

export type PoiDynamicValue = string | boolean | string[] | undefined;

export interface PoiFormValues extends PoiFixedFormValues {
  customFields: Record<string, PoiDynamicValue>;
  filterValues: Record<string, PoiDynamicValue>;
}

// Shared inline error copy (Copywriting Contract) for a geocodeErrorCode
// carried on a create/update/retry response. ADDRESS_AMBIGUOUS is handled
// differently on the edit screen (the candidate picker banner, plan 01-04
// task 2) but this fallback text still applies anywhere the code surfaces
// without that banner (for example the create screen, where no picker
// exists yet).
export function poiErrorCopy(errorCode: string): string {
  if (errorCode === 'ADDRESS_AMBIGUOUS') {
    return "We found more than one match for this address — pick the correct one from the POI edit screen's candidate picker.";
  }
  return "We couldn't verify this address. Double-check the street, city, state, and ZIP, then save again.";
}

export function buildPoiDynamicSchema(fields: PackFieldDefinition[]) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const field of fields) {
    if (field.dataType === 'boolean') {
      shape[field.fieldKey] = field.isRequired
        ? z.boolean({ required_error: `${field.label} is required.` })
        : z.boolean().optional();
      continue;
    }
    let base = z.string();
    if (field.dataType === 'url') base = base.url('Enter a valid URL.');
    if (field.isRequired) {
      shape[field.fieldKey] = base.min(1, `${field.label} is required.`);
    } else {
      shape[field.fieldKey] = base.optional().or(z.literal(''));
    }
  }
  return z.object(shape).catchall(z.any());
}
