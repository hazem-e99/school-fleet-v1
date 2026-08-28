'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function GuardianHome() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/dashboard/guardian/children');
  }, [router]);
  return null;
}
