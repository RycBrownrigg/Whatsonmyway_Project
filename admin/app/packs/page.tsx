'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
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
import { ApiError, packApi, poiTypeApi } from '@/lib/api';

const CreatePackFormSchema = z.object({
  name: z.string().min(1, 'Pack name is required'),
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/, 'Lowercase letters, numbers, and hyphens only'),
  packType: z.enum(['standard', 'state']),
  appleProductId: z.string().min(1, 'Apple product ID is required'),
  poiTypeId: z.string().uuid().optional(),
});

type CreatePackForm = z.infer<typeof CreatePackFormSchema>;

export default function PacksPage() {
  const queryClient = useQueryClient();
  const packsQuery = useQuery({ queryKey: ['packs'], queryFn: packApi.list });
  const poiTypesQuery = useQuery({ queryKey: ['poi-types'], queryFn: poiTypeApi.list });

  const [isCreatingPoiType, setIsCreatingPoiType] = useState(false);
  const [newPoiTypeName, setNewPoiTypeName] = useState('');
  const [newPoiTypeSlug, setNewPoiTypeSlug] = useState('');

  const form = useForm<CreatePackForm>({
    resolver: zodResolver(CreatePackFormSchema),
    defaultValues: { name: '', slug: '', packType: 'standard', appleProductId: '', poiTypeId: undefined },
  });

  const createPack = useMutation({
    mutationFn: packApi.create,
    onSuccess: () => {
      toast.success('Pack created');
      form.reset();
      queryClient.invalidateQueries({ queryKey: ['packs'] });
    },
    onError: (err) => {
      const code = err instanceof ApiError ? err.code : 'UNKNOWN_ERROR';
      toast.error(`Failed to create pack: ${code}`);
    },
  });

  const createPoiType = useMutation({
    mutationFn: poiTypeApi.create,
    onSuccess: (created) => {
      toast.success('POI type created');
      queryClient.invalidateQueries({ queryKey: ['poi-types'] });
      form.setValue('poiTypeId', created.id);
      setIsCreatingPoiType(false);
      setNewPoiTypeName('');
      setNewPoiTypeSlug('');
    },
    onError: (err) => {
      const code = err instanceof ApiError ? err.code : 'UNKNOWN_ERROR';
      toast.error(`Failed to create POI type: ${code}`);
    },
  });

  return (
    <div className="flex flex-1 flex-col gap-8 px-8 py-8">
      <h1 className="text-2xl font-semibold text-zinc-900">Packs</h1>

      <Card>
        <CardHeader>
          <CardTitle>New Pack</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={form.handleSubmit((data) => createPack.mutate(data))}
            className="grid grid-cols-2 gap-4"
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" {...form.register('name')} />
              {form.formState.errors.name ? (
                <p className="text-sm text-red-600">{form.formState.errors.name.message}</p>
              ) : null}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="slug">Slug</Label>
              <Input id="slug" {...form.register('slug')} />
              {form.formState.errors.slug ? (
                <p className="text-sm text-red-600">{form.formState.errors.slug.message}</p>
              ) : null}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="appleProductId">Apple Product ID</Label>
              <Input id="appleProductId" {...form.register('appleProductId')} />
              {form.formState.errors.appleProductId ? (
                <p className="text-sm text-red-600">
                  {form.formState.errors.appleProductId.message}
                </p>
              ) : null}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="poiTypeId">POI Type</Label>
              {isCreatingPoiType ? (
                <div className="flex flex-col gap-2">
                  <Input
                    placeholder="Name"
                    value={newPoiTypeName}
                    onChange={(e) => setNewPoiTypeName(e.target.value)}
                  />
                  <Input
                    placeholder="slug"
                    value={newPoiTypeSlug}
                    onChange={(e) => setNewPoiTypeSlug(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={createPoiType.isPending}
                      onClick={() =>
                        createPoiType.mutate({ name: newPoiTypeName, slug: newPoiTypeSlug })
                      }
                    >
                      Save POI Type
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setIsCreatingPoiType(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Select
                    value={form.watch('poiTypeId') ?? ''}
                    onValueChange={(value) => form.setValue('poiTypeId', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a POI type..." />
                    </SelectTrigger>
                    <SelectContent>
                      {(poiTypesQuery.data ?? []).map((poiType) => (
                        <SelectItem key={poiType.id} value={poiType.id}>
                          {poiType.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button type="button" variant="secondary" size="sm" onClick={() => setIsCreatingPoiType(true)}>
                    + create a new POI type
                  </Button>
                </div>
              )}
            </div>
            <div className="col-span-2 flex justify-end">
              <Button type="submit" disabled={createPack.isPending} className="bg-blue-600 hover:bg-blue-700">
                Create Pack
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {packsQuery.isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(packsQuery.data ?? []).map((pack) => (
              <TableRow key={pack.id}>
                <TableCell>
                  <Link href={`/packs/detail?id=${pack.id}`} className="text-blue-600 hover:underline">
                    {pack.name}
                  </Link>
                </TableCell>
                <TableCell>{pack.slug}</TableCell>
                <TableCell>{pack.packType}</TableCell>
                <TableCell>{pack.status}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
