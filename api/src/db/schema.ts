import {
  pgTable, uuid, text, char, boolean, integer,
  jsonb, timestamp, doublePrecision, unique, primaryKey, index,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  appleSub: text('apple_sub').notNull().unique(),
  email: text('email'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const poiTypes = pgTable('poi_types', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const packs = pgTable('packs', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  packType: text('pack_type', { enum: ['standard', 'state'] }).notNull(),
  poiTypeId: uuid('poi_type_id').references(() => poiTypes.id),
  stateCode: char('state_code', { length: 2 }),
  appleProductId: text('apple_product_id').notNull().unique(),
  priceTier: text('price_tier'),
  status: text('status', { enum: ['draft', 'published', 'deprecated'] }).notNull().default('draft'),
  currentVersion: integer('current_version').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const packFieldDefinitions = pgTable('pack_field_definitions', {
  id: uuid('id').primaryKey().defaultRandom(),
  packId: uuid('pack_id').notNull().references(() => packs.id, { onDelete: 'cascade' }),
  fieldKey: text('field_key').notNull(),
  label: text('label').notNull(),
  dataType: text('data_type', { enum: ['text', 'number', 'boolean', 'url', 'phone', 'enum'] }).notNull(),
  enumOptions: jsonb('enum_options'),
  isRequired: boolean('is_required').notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
}, (t) => ({
  uniq: unique().on(t.packId, t.fieldKey),
}));

export const packFilterDefinitions = pgTable('pack_filter_definitions', {
  id: uuid('id').primaryKey().defaultRandom(),
  packId: uuid('pack_id').notNull().references(() => packs.id, { onDelete: 'cascade' }),
  filterKey: text('filter_key').notNull(),
  label: text('label').notNull(),
  filterType: text('filter_type', { enum: ['boolean', 'single-select', 'multi-select'] }).notNull(),
  options: jsonb('options'),
  sortOrder: integer('sort_order').notNull().default(0),
}, (t) => ({
  uniq: unique().on(t.packId, t.filterKey),
}));

export const pois = pgTable('pois', {
  id: uuid('id').primaryKey().defaultRandom(),
  poiTypeId: uuid('poi_type_id').notNull().references(() => poiTypes.id),
  name: text('name').notNull(),
  addressStreet: text('address_street').notNull(),
  addressCity: text('address_city').notNull(),
  addressState: char('address_state', { length: 2 }).notNull(),
  addressZip: text('address_zip').notNull(),
  phone: text('phone'),
  website: text('website'),
  additionalInfo: text('additional_info'),
  latitude: doublePrecision('latitude'),
  longitude: doublePrecision('longitude'),
  geocodeStatus: text('geocode_status', { enum: ['pending', 'ok', 'low_confidence', 'failed'] }).notNull().default('pending'),
  geocodeConfidence: doublePrecision('geocode_confidence'),
  geocodeCandidates: jsonb('geocode_candidates'),
  customFields: jsonb('custom_fields').notNull().default({}),
  filterValues: jsonb('filter_values').notNull().default({}),
  status: text('status', { enum: ['active', 'flagged', 'archived'] }).notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  poiTypeIdx: index('pois_poi_type_idx').on(t.poiTypeId),
  stateIdx: index('pois_state_idx').on(t.addressState),
  latLngIdx: index('pois_lat_lng_idx').on(t.latitude, t.longitude),
}));

export const packPois = pgTable('pack_pois', {
  packId: uuid('pack_id').notNull().references(() => packs.id, { onDelete: 'cascade' }),
  poiId: uuid('poi_id').notNull().references(() => pois.id, { onDelete: 'cascade' }),
}, (t) => ({
  pk: primaryKey({ columns: [t.packId, t.poiId] }),
}));

export const packVersions = pgTable('pack_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  packId: uuid('pack_id').notNull().references(() => packs.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  formatVersion: integer('format_version').notNull().default(1),
  fileUrl: text('file_url').notNull(),
  checksum: text('checksum').notNull(),
  poiCount: integer('poi_count').notNull(),
  changelog: text('changelog'),
  releasedAt: timestamp('released_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniq: unique().on(t.packId, t.version),
}));

export const entitlements = pgTable('entitlements', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  packId: uuid('pack_id').notNull().references(() => packs.id),
  appleOriginalTransactionId: text('apple_original_transaction_id').notNull(),
  appleTransactionId: text('apple_transaction_id').notNull(),
  environment: text('environment', { enum: ['sandbox', 'production'] }).notNull().default('production'),
  purchasedAt: timestamp('purchased_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
}, (t) => ({
  uniq: unique().on(t.userId, t.packId),
}));

export const imports = pgTable('imports', {
  id: uuid('id').primaryKey().defaultRandom(),
  poiTypeId: uuid('poi_type_id').notNull().references(() => poiTypes.id),
  filename: text('filename').notNull(),
  status: text('status', { enum: ['processing', 'completed', 'failed'] }).notNull().default('processing'),
  totalRows: integer('total_rows').notNull().default(0),
  flaggedRows: integer('flagged_rows').notNull().default(0),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

export const importRowErrors = pgTable('import_row_errors', {
  id: uuid('id').primaryKey().defaultRandom(),
  importId: uuid('import_id').notNull().references(() => imports.id, { onDelete: 'cascade' }),
  rowNumber: integer('row_number').notNull(),
  errorCode: text('error_code').notNull(),
  field: text('field'),
  message: text('message').notNull(),
});

export const feedbackSubmissions = pgTable('feedback_submissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id),
  packSlug: text('pack_slug'),
  poiName: text('poi_name'),
  poiAddress: text('poi_address'),
  message: text('message').notNull(),
  status: text('status', { enum: ['open', 'resolved'] }).notNull().default('open'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
