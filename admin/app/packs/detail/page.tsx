'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ApiError, packApi, type CreateFieldInput } from '@/lib/api';

const DATA_TYPES: CreateFieldInput['dataType'][] = [
  'text',
  'number',
  'boolean',
  'url',
  'phone',
  'enum',
];

function PackDetailContent() {
  const searchParams = useSearchParams();
  const packId = searchParams.get('id') ?? '';
  const queryClient = useQueryClient();

  const detailQuery = useQuery({
    queryKey: ['packs', packId],
    queryFn: () => packApi.get(packId),
    enabled: Boolean(packId),
  });

  const [fieldKey, setFieldKey] = useState('');
  const [fieldLabel, setFieldLabel] = useState('');
  const [dataType, setDataType] = useState<CreateFieldInput['dataType']>('text');
  const [isRequired, setIsRequired] = useState(false);

  const addField = useMutation({
    mutationFn: (input: CreateFieldInput) => packApi.addField(packId, input),
    onSuccess: () => {
      toast.success('Field saved');
      setFieldKey('');
      setFieldLabel('');
      setDataType('text');
      setIsRequired(false);
      queryClient.invalidateQueries({ queryKey: ['packs', packId] });
    },
    onError: (err) => {
      const code = err instanceof ApiError ? err.code : 'UNKNOWN_ERROR';
      toast.error(`Failed to save field: ${code}`);
    },
  });

  function handleSaveField() {
    addField.mutate({ fieldKey, label: fieldLabel, dataType, isRequired });
  }

  if (!packId) {
    return <p className="px-8 py-8 text-sm text-zinc-600">No pack selected.</p>;
  }

  if (detailQuery.isLoading) {
    return <p className="px-8 py-8 text-sm text-zinc-600">Loading…</p>;
  }

  if (detailQuery.isError) {
    return <p className="px-8 py-8 text-sm text-red-600">Could not load this pack.</p>;
  }

  const { pack, fields } = detailQuery.data!;

  return (
    <div className="flex flex-1 flex-col gap-8 px-8 py-8">
      <Card>
        <CardHeader>
          <CardTitle>{pack.name}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2 text-sm text-zinc-700">
          <span>Slug: {pack.slug}</span>
          <span>Type: {pack.packType}</span>
          <span>Status: {pack.status}</span>
          <span>Apple Product ID: {pack.appleProductId}</span>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fields</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {fields.length === 0 ? (
            <div>
              <p className="text-sm font-semibold text-zinc-900">No fields yet</p>
              <p className="text-sm text-zinc-600">
                Add a field to start building this pack&apos;s data shape.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Key</TableHead>
                  <TableHead>Label</TableHead>
                  <TableHead>Data Type</TableHead>
                  <TableHead>Required</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fields.map((field) => (
                  <TableRow key={field.id}>
                    <TableCell>{field.fieldKey}</TableCell>
                    <TableCell>{field.label}</TableCell>
                    <TableCell>{field.dataType}</TableCell>
                    <TableCell>{field.isRequired ? 'Yes' : 'No'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <div className="grid grid-cols-5 items-end gap-4 border-t pt-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="field-key">Key</Label>
              <Input id="field-key" value={fieldKey} onChange={(e) => setFieldKey(e.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="field-label">Label</Label>
              <Input
                id="field-label"
                value={fieldLabel}
                onChange={(e) => setFieldLabel(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Data Type</Label>
              <Select value={dataType} onValueChange={(value) => setDataType(value as CreateFieldInput['dataType'])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DATA_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="field-required"
                checked={isRequired}
                onCheckedChange={(checked) => setIsRequired(checked === true)}
              />
              <Label htmlFor="field-required">Required</Label>
            </div>
            <Button
              onClick={handleSaveField}
              disabled={addField.isPending || !fieldKey || !fieldLabel}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Save Pack Framework
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function PackDetailPage() {
  return (
    <Suspense fallback={<p className="px-8 py-8 text-sm text-zinc-600">Loading…</p>}>
      <PackDetailContent />
    </Suspense>
  );
}
