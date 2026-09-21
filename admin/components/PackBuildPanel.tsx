'use client';

import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ApiError, packApi, type MissingFieldReportEntry, type PackBuildResult } from '@/lib/api';

// D-04's two named build-failure copies — hardcoded here rather than taken
// from the API response, matching this codebase's existing convention
// (lib/poiForm.ts's poiErrorCopy) of keying user-facing copy off the error
// *code* the server returns, not its message string.
const NO_ELIGIBLE_POIS_COPY = 'This pack has no geocoded POIs yet. Add or fix POIs before building.';

function BuildFailureBanner({
  heading,
  body,
  report,
  packId,
}: {
  heading: string;
  body?: string;
  report?: MissingFieldReportEntry[];
  packId: string;
}) {
  return (
    <div className="rounded-lg border border-red-600 bg-red-50 p-4">
      <p className="text-sm font-semibold text-red-600">{heading}</p>
      {body && <p className="mt-1 text-sm text-red-600">{body}</p>}
      {report && report.length > 0 && (
        <div className="mt-4 max-h-64 overflow-y-auto rounded border border-red-200 bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>POI Name</TableHead>
                <TableHead>Missing Field(s)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.map((entry) => (
                <TableRow key={entry.poiId}>
                  <TableCell>
                    <Link
                      href={`/packs/pois/edit?id=${entry.poiId}&packId=${packId}`}
                      className="text-blue-600 hover:underline"
                    >
                      {entry.poiName}
                    </Link>
                  </TableCell>
                  <TableCell>{entry.missingFieldKeys.join(', ')}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

export function PackBuildPanel({
  packId,
  currentVersion,
}: {
  packId: string;
  currentVersion: number;
}) {
  const queryClient = useQueryClient();

  const buildMutation = useMutation<PackBuildResult, ApiError>({
    mutationFn: () => packApi.build(packId),
    onSuccess: (result) => {
      toast.success(`Pack built — version ${result.version}, ${result.poiCount} POIs included.`);
      queryClient.invalidateQueries({ queryKey: ['packs', packId] });
    },
    onError: (err) => {
      if (err.code === 'MISSING_REQUIRED_FIELDS' || err.code === 'PACK_HAS_NO_ELIGIBLE_POIS') {
        // Rendered inline by the banner below — no toast for these two.
        return;
      }
      toast.error(`Build failed: ${err.code}`);
    },
  });

  const latest = buildMutation.data;
  const failure = buildMutation.isError ? buildMutation.error : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Build</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="text-sm text-zinc-700">
          <p>Current version: {latest?.version ?? currentVersion}</p>
          {latest && (
            <>
              <p>POIs included: {latest.poiCount}</p>
              <p className="truncate" title={latest.checksum}>
                Checksum: {latest.checksum}
              </p>
            </>
          )}
        </div>

        {failure?.code === 'MISSING_REQUIRED_FIELDS' && (
          <BuildFailureBanner
            heading="Build failed — missing required fields."
            body="Fix these POIs, then build again."
            report={failure.report}
            packId={packId}
          />
        )}

        {failure?.code === 'PACK_HAS_NO_ELIGIBLE_POIS' && (
          <BuildFailureBanner heading={NO_ELIGIBLE_POIS_COPY} packId={packId} />
        )}

        <div>
          <Button
            onClick={() => buildMutation.mutate()}
            disabled={buildMutation.isPending}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {buildMutation.isPending ? (
              <>
                <Loader2 className="animate-spin" />
                Building…
              </>
            ) : (
              'Build Pack'
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
