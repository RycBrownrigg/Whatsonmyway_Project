'use client';

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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ApiError, packApi } from '@/lib/api';

const CreatePackFormSchema = z.object({
  name: z.string().min(1, 'Pack name is required'),
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/, 'Lowercase letters, numbers, and hyphens only'),
  packType: z.enum(['standard', 'state']),
  appleProductId: z.string().min(1, 'Apple product ID is required'),
});

type CreatePackForm = z.infer<typeof CreatePackFormSchema>;

export default function PacksPage() {
  const queryClient = useQueryClient();
  const packsQuery = useQuery({ queryKey: ['packs'], queryFn: packApi.list });

  const form = useForm<CreatePackForm>({
    resolver: zodResolver(CreatePackFormSchema),
    defaultValues: { name: '', slug: '', packType: 'standard', appleProductId: '' },
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
