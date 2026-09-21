'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError, clearAdminToken, packApi, setAdminToken } from '@/lib/api';

export default function SignInPage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    setAdminToken(token);

    try {
      await packApi.list();
      router.push('/packs');
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        clearAdminToken();
        setError('Invalid token — check the value in your `.env` file and try again.');
      } else {
        clearAdminToken();
        setError('Something went wrong signing in. Check the API is running and try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center px-8 py-16">
      <div className="w-full max-w-sm">
        <h1 className="mb-8 text-2xl font-semibold text-zinc-900">Sign In</h1>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="admin-token">Admin token</Label>
            <Input
              id="admin-token"
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              required
            />
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <Button type="submit" disabled={isSubmitting} className="bg-blue-600 hover:bg-blue-700">
            Sign In
          </Button>
        </form>
      </div>
    </div>
  );
}
