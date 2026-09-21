// Product Specification.md §8 UC-14 — Build/rebuild a standard pack. Turns a
// populated pack into a versioned, checksummed, downloadable artifact: select
// every eligible master POI, refuse the build when a required framework
// field is missing anywhere, snapshot the membership, write the pack file,
// checksum it, and cut a version. Never publishes — `packs.status` is left
// exactly as it was (step 6 is a separate, explicit admin act).
import { promisify } from 'node:util';
import { gzip as gzipCallback } from 'node:zlib';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { and, asc, desc, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import {
  packFieldDefinitions,
  packFilterDefinitions,
  packPois,
  packVersions,
  packs,
  poiTypes,
  pois,
} from '../db/schema.js';
import { AppError } from '../utils/errors.js';

const gzip = promisify(gzipCallback);

export interface MissingFieldReport {
  poiId: string;
  poiName: string;
  missingFieldKeys: string[];
}

export interface PackBuildResult {
  version: number;
  poiCount: number;
  checksum: string;
  fileUrl: string;
}

// The shape validateRequiredFields needs from a field definition and a POI —
// deliberately narrower than the full Drizzle row types so this function
// stays trivially unit-testable without seeding a real pack/POI through the
// database.
interface RequiredFieldDef {
  fieldKey: string;
  isRequired: boolean;
}

interface PoiForValidation {
  id: string;
  name: string;
  customFields: Record<string, unknown>;
}

// A required field counts as missing when the POI's customFields has no
// entry for that fieldKey, or the entry is null, undefined, or an empty
// string. Returns one entry per offending POI listing every missing key on
// it — no cap, no slice, no early exit: the admin fixes the whole pack in
// one pass (TC-27, and this plan's own prohibition against a truncated
// report).
export function validateRequiredFields(
  fields: RequiredFieldDef[],
  poisToCheck: PoiForValidation[],
): MissingFieldReport[] {
  const requiredKeys = fields.filter((f) => f.isRequired).map((f) => f.fieldKey);
  if (requiredKeys.length === 0) {
    return [];
  }

  const report: MissingFieldReport[] = [];
  for (const poi of poisToCheck) {
    const missingFieldKeys: string[] = [];
    for (const key of requiredKeys) {
      const value = poi.customFields?.[key];
      if (value === undefined || value === null || value === '') {
        missingFieldKeys.push(key);
      }
    }
    if (missingFieldKeys.length > 0) {
      report.push({ poiId: poi.id, poiName: poi.name, missingFieldKeys });
    }
  }
  return report;
}

// T-01-19 (threat model): the path segment comes from `packs.slug`, which
// `CreatePackSchema` already constrains to `^[a-z0-9][a-z0-9-]{0,62}$` — no
// dots, no separators, so no traversal is expressible. This is a defense in
// depth check: resolve the final path and assert it stays inside the
// resolved PACK_FILE_DIR before ever writing to it.
function assertPathInsidePackFileDir(filePath: string, packFileDir: string): void {
  const resolvedDir = path.resolve(packFileDir);
  const resolvedFile = path.resolve(filePath);
  if (resolvedFile !== resolvedDir && !resolvedFile.startsWith(resolvedDir + path.sep)) {
    throw new AppError(
      500,
      'PACK_FILE_PATH_ESCAPE',
      'Resolved pack file path escaped the configured pack file directory.',
    );
  }
}

export async function buildStandardPack(packId: string): Promise<PackBuildResult> {
  const [pack] = await db.select().from(packs).where(eq(packs.id, packId));
  if (!pack) {
    throw new AppError(404, 'PACK_NOT_FOUND', 'Pack not found.');
  }

  // UC-15 (state packs) is Phase 4 — out of scope here.
  if (pack.packType === 'state') {
    throw new AppError(
      400,
      'STATE_PACK_BUILD_NOT_SUPPORTED',
      'State pack builds are not supported yet.',
    );
  }

  if (!pack.poiTypeId) {
    throw new AppError(400, 'PACK_HAS_NO_POI_TYPE', 'This pack has no POI type set.');
  }

  const [poiType] = await db.select().from(poiTypes).where(eq(poiTypes.id, pack.poiTypeId));

  const fields = await db
    .select()
    .from(packFieldDefinitions)
    .where(eq(packFieldDefinitions.packId, packId))
    .orderBy(asc(packFieldDefinitions.sortOrder), asc(packFieldDefinitions.fieldKey));

  const filters = await db
    .select()
    .from(packFilterDefinitions)
    .where(eq(packFilterDefinitions.packId, packId))
    .orderBy(asc(packFilterDefinitions.sortOrder), asc(packFilterDefinitions.filterKey));

  // Eligibility: right POI type, geocode_status ok, status active. Ordered
  // by pois.id purely for reproducible, diffable builds — the client
  // filters by bounding box plus haversine, never by position, so this
  // ordering carries no app-facing meaning.
  const eligiblePois = await db
    .select()
    .from(pois)
    .where(
      and(
        eq(pois.poiTypeId, pack.poiTypeId),
        eq(pois.geocodeStatus, 'ok'),
        eq(pois.status, 'active'),
      ),
    )
    .orderBy(asc(pois.id));

  if (eligiblePois.length === 0) {
    throw new AppError(
      400,
      'PACK_HAS_NO_ELIGIBLE_POIS',
      'This pack has no geocoded POIs yet. Add or fix POIs before building.',
    );
  }

  const report = validateRequiredFields(
    fields.map((f) => ({ fieldKey: f.fieldKey, isRequired: f.isRequired })),
    eligiblePois.map((p) => ({
      id: p.id,
      name: p.name,
      customFields: (p.customFields ?? {}) as Record<string, unknown>,
    })),
  );

  if (report.length > 0) {
    // Write nothing — the previous version and snapshot must survive a
    // failed build untouched.
    throw new AppError(
      422,
      'MISSING_REQUIRED_FIELDS',
      'One or more included POIs are missing a required field.',
      report,
    );
  }

  const [maxVersionRow] = await db
    .select({ version: packVersions.version })
    .from(packVersions)
    .where(eq(packVersions.packId, packId))
    .orderBy(desc(packVersions.version))
    .limit(1);
  const nextVersion = (maxVersionRow?.version ?? 0) + 1;

  const fileDocument = {
    format_version: 1,
    pack: {
      id: pack.id,
      slug: pack.slug,
      name: pack.name,
      pack_type: pack.packType,
      version: nextVersion,
      poi_type_slug: poiType?.slug ?? null,
      state_code: pack.stateCode,
    },
    field_defs: fields.map((f) => ({
      field_key: f.fieldKey,
      label: f.label,
      data_type: f.dataType,
      enum_options: f.enumOptions,
      sort_order: f.sortOrder,
    })),
    filter_defs: filters.map((f) => ({
      filter_key: f.filterKey,
      label: f.label,
      filter_type: f.filterType,
      options: f.options,
      sort_order: f.sortOrder,
    })),
    pois: eligiblePois.map((p) => ({
      id: p.id,
      poi_type_slug: poiType?.slug ?? null,
      name: p.name,
      address_street: p.addressStreet,
      address_city: p.addressCity,
      address_state: p.addressState,
      address_zip: p.addressZip,
      phone: p.phone,
      website: p.website,
      additional_info: p.additionalInfo,
      latitude: p.latitude,
      longitude: p.longitude,
      custom_fields: p.customFields,
      filter_values: p.filterValues,
    })),
  };

  const jsonBytes = Buffer.from(JSON.stringify(fileDocument), 'utf8');
  const gzippedBytes = await gzip(jsonBytes);
  const checksum = createHash('sha256').update(gzippedBytes).digest('hex');

  const packFileDir = process.env.PACK_FILE_DIR ?? './packfiles';
  const packDir = path.join(packFileDir, pack.slug);
  const filePath = path.join(packDir, `v${nextVersion}.json.gz`);
  assertPathInsidePackFileDir(filePath, packFileDir);

  await mkdir(packDir, { recursive: true });
  await writeFile(filePath, gzippedBytes);

  const fileUrl = `/v1/packs/${pack.slug}/download?version=${nextVersion}`;

  await db.transaction(async (tx) => {
    await tx.delete(packPois).where(eq(packPois.packId, packId));
    await tx.insert(packPois).values(eligiblePois.map((p) => ({ packId, poiId: p.id })));
    await tx.insert(packVersions).values({
      packId,
      version: nextVersion,
      formatVersion: 1,
      fileUrl,
      checksum,
      poiCount: eligiblePois.length,
    });
    // A build never publishes (UC-14 step 6) — packs.status is untouched.
    await tx.update(packs).set({ currentVersion: nextVersion }).where(eq(packs.id, packId));
  });

  return { version: nextVersion, poiCount: eligiblePois.length, checksum, fileUrl };
}
