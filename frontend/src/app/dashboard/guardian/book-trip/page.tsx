'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { useI18n } from '@/contexts/LanguageContext';
import { childrenAPI } from '@/lib/api';
import type { Child } from '@/types/user';
import { GraduationCap, MapPin, Info } from 'lucide-react';

export default function GuardianBookTripPage() {
  const { t } = useI18n();
  const [children, setChildren] = useState<Child[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const kids = await childrenAPI.getMyChildren();
        setChildren(kids as Child[]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="p-4 sm:p-6">{t('common.loading', 'Loading...')}</div>;

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('pages.guardian.bookTrip.title', 'Book a Trip')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-2 rounded-lg bg-primary-light p-3 text-sm text-text-secondary">
            <Info className="h-4 w-4 mt-0.5 text-primary" />
            <span>
              {t(
                'pages.guardian.bookTrip.note',
                'Each child with an active subscription is automatically assigned to their school route. Contact the school administration to change a route or pickup point.',
              )}
            </span>
          </div>

          {children.length === 0 ? (
            <p className="text-text-secondary text-sm">
              {t('pages.guardian.bookTrip.noChildren', 'Add a child first from the "My Children" page.')}
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {children.map((child) => (
                <div key={child.id} className="rounded-xl border border-border p-4">
                  <div className="font-semibold text-text-primary">{child.fullName}</div>
                  <div className="text-sm text-text-secondary flex items-center gap-1 mt-1">
                    <GraduationCap className="h-4 w-4" /> {child.schoolName}
                  </div>
                  <div className="text-sm text-text-secondary flex items-center gap-1">
                    <MapPin className="h-4 w-4" /> {child.pickupAreaName}
                  </div>
                  <div className="mt-2">
                    {child.activeSubscription ? (
                      <Badge variant="default">{t('pages.guardian.bookTrip.active', 'Route assigned')}</Badge>
                    ) : (
                      <Badge variant="secondary">{t('pages.guardian.bookTrip.needsPlan', 'Needs a subscription')}</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
