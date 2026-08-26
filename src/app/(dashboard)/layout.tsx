'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { LoadingPage } from '@/components/loading';
import { getMe } from '@/lib/api';

interface UserData {
  id: string;
  email: string;
  name: string | null;
  role: string;
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMe()
      .then((res) => {
        if (res.data) {
          setUser(res.data);
        } else {
          router.push('/login');
        }
      })
      .catch(() => {
        router.push('/login');
      })
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-950">
        <LoadingPage />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex h-screen bg-surface-950 overflow-hidden">
      <Sidebar user={user} />
      <main className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="p-6 lg:p-8 max-w-[1400px] mx-auto">{children}</div>
      </main>
    </div>
  );
}
