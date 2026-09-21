// TDD RED placeholder — implementation lands in the GREEN commit.
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

interface RequiredFieldDef {
  fieldKey: string;
  isRequired: boolean;
}

interface PoiForValidation {
  id: string;
  name: string;
  customFields: Record<string, unknown>;
}

export function validateRequiredFields(
  _fields: RequiredFieldDef[],
  _poisToCheck: PoiForValidation[],
): MissingFieldReport[] {
  return [];
}

export async function buildStandardPack(_packId: string): Promise<PackBuildResult> {
  throw new Error('not implemented');
}
