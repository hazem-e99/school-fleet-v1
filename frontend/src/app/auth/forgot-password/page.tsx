'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardContent, CardDescription, CardTitle, CardHeader } from '@/components/ui/Card';
import { useToast } from '@/components/ui/Toast';
import { KeyRound, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { authAPI } from '@/lib/api';
import { getApiErrorMessage } from '@/lib/apiError';
import { useI18n } from '@/contexts/LanguageContext';
import LanguageSwitcher from '@/components/ui/LanguageSwitcher';

const PHONE_RE = /^01[0-2,5]{1}[0-9]{8}$/;
const NID_RE = /^\d{14}$/;

export default function ForgotPasswordPage() {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const { t } = useI18n();
  const router = useRouter();
  const { showToast } = useToast();

  const isValid =
    PHONE_RE.test(phoneNumber.trim()) &&
    NID_RE.test(nationalId.trim()) &&
    newPassword.length >= 6 &&
    newPassword === confirmPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!isValid) {
      setError(t('pages.auth.forgotPassword.invalid', 'Please fill in all fields correctly. Passwords must match and be at least 6 characters.'));
      return;
    }
    setIsLoading(true);
    try {
      await authAPI.forgotPassword({
        phoneNumber: phoneNumber.trim(),
        nationalId: nationalId.trim(),
        newPassword,
        confirmPassword,
      });
      showToast({
        type: 'success',
        title: t('pages.auth.forgotPassword.toasts.successTitle', 'Password Reset'),
        message: t('pages.auth.forgotPassword.toasts.successMessage', 'Your password has been reset. You can now sign in.'),
      });
      router.push('/auth/login');
    } catch (err: unknown) {
      setError(getApiErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-background flex items-center justify-center p-6">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 -left-32 h-80 w-80 rounded-full bg-gradient-to-br from-primary/25 to-primary-hover/25 blur-3xl opacity-70 animate-pulse" />
        <div className="absolute -bottom-32 -right-32 h-80 w-80 rounded-full bg-gradient-to-tr from-emerald-400/15 to-sky-400/15 blur-3xl opacity-70 animate-pulse" />
      </div>
      <div className="absolute top-4 right-4 z-10">
        <LanguageSwitcher />
      </div>
      <div className="w-full max-w-md relative">
        <div className="group relative">
          <div className="absolute -inset-[2px] rounded-3xl bg-gradient-to-r from-primary/50 via-primary-hover/50 to-primary/50 opacity-70 blur-xl transition-opacity duration-500 group-hover:opacity-90" aria-hidden="true" />
          <Card className="relative rounded-2xl border border-white/10 bg-background/70 backdrop-blur-xl shadow-2xl">
            <CardHeader className="text-center">
              <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-2xl bg-gradient-to-r from-primary to-primary-hover mb-4 shadow-xl">
                <KeyRound className="h-8 w-8 text-white" />
              </div>
              <CardTitle className="text-2xl font-bold text-text-primary">
                {t('pages.auth.forgotPassword.title', 'Reset Password')}
              </CardTitle>
              <CardDescription className="text-text-secondary">
                {t('pages.auth.forgotPassword.description', 'Enter your phone number and national ID to set a new password.')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label htmlFor="phoneNumber" className="block text-sm font-medium text-text-primary mb-1">
                    {t('pages.auth.forgotPassword.fields.phoneNumber', 'Phone Number')}
                  </label>
                  <Input
                    id="phoneNumber"
                    type="tel"
                    inputMode="tel"
                    pattern="^01[0-2,5]{1}[0-9]{8}$"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    required
                    className="w-full h-11 rounded-xl bg-background/70"
                  />
                </div>
                <div>
                  <label htmlFor="nationalId" className="block text-sm font-medium text-text-primary mb-1">
                    {t('pages.auth.forgotPassword.fields.nationalId', 'National ID')}
                  </label>
                  <Input
                    id="nationalId"
                    type="text"
                    inputMode="numeric"
                    maxLength={14}
                    value={nationalId}
                    onChange={(e) => setNationalId(e.target.value.replace(/[^0-9]/g, '').slice(0, 14))}
                    required
                    className="w-full h-11 rounded-xl bg-background/70"
                  />
                </div>
                <div>
                  <label htmlFor="newPassword" className="block text-sm font-medium text-text-primary mb-1">
                    {t('pages.auth.forgotPassword.fields.newPassword', 'New Password')}
                  </label>
                  <div className="relative">
                    <Input
                      id="newPassword"
                      type={showPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      minLength={6}
                      required
                      className="w-full h-11 pr-10 rounded-xl bg-background/70"
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary">
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-text-primary mb-1">
                    {t('pages.auth.forgotPassword.fields.confirmPassword', 'Confirm Password')}
                  </label>
                  <Input
                    id="confirmPassword"
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    minLength={6}
                    required
                    className="w-full h-11 rounded-xl bg-background/70"
                  />
                </div>

                {error && <div className="text-red-600 text-sm text-center">{error}</div>}

                <Button
                  type="submit"
                  disabled={isLoading || !isValid}
                  className="w-full h-12 rounded-xl bg-gradient-to-r from-primary to-primary-hover text-white shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all hover:-translate-y-0.5 active:translate-y-0"
                >
                  {isLoading ? t('pages.auth.forgotPassword.cta.saving', 'Saving...') : t('pages.auth.forgotPassword.cta.save', 'Reset Password')}
                </Button>

                <div className="text-center">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => router.push('/auth/login')}
                    className="flex items-center gap-2 mx-auto text-text-secondary hover:text-text-primary"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    {t('pages.auth.forgotPassword.backToLogin', 'Back to Login')}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
