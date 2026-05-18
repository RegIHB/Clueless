'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/dialog';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Button } from '@/app/components/ui/button';
import { Eye, EyeOff } from 'lucide-react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

type ResetPasswordDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPasswordUpdated?: () => void | Promise<void>;
};

function stripAuthHashFromUrl() {
  if (typeof window === 'undefined') return;
  const { pathname, search } = window.location;
  if (!window.location.hash) return;
  window.history.replaceState(null, '', `${pathname}${search}`);
}

export function ResetPasswordDialog({
  open,
  onOpenChange,
  onPasswordUpdated,
}: ResetPasswordDialogProps) {
  const closedAfterSuccess = useRef(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      closedAfterSuccess.current = false;
      setPassword('');
      setConfirm('');
      setShowPassword(false);
      setFormError(null);
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (password.length < 6) {
      setFormError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      setFormError('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setFormError(error.message);
        return;
      }
      closedAfterSuccess.current = true;
      stripAuthHashFromUrl();
      onOpenChange(false);
      void Promise.resolve(onPasswordUpdated?.()).catch((err) => {
        console.error('onPasswordUpdated failed', err);
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !closedAfterSuccess.current) {
          // 'local' scope clears the recovery session synchronously without a
          // network round-trip — matches the main logout flow and avoids hangs.
          void createBrowserSupabaseClient()
            .auth.signOut({ scope: 'local' })
            .catch((err) => console.error('Recovery signOut failed', err));
        }
        onOpenChange(next);
        if (!next) {
          setPassword('');
          setConfirm('');
          setShowPassword(false);
          setFormError(null);
        }
      }}
    >
      <DialogContent
        className="border-[3px] border-[var(--clue-border)] shadow-[var(--clue-shadow-lg)] sm:max-w-md"
        style={{ background: 'var(--clue-surface-accent)' }}
      >
        <DialogHeader>
          <DialogTitle className="text-xl font-black tracking-tight uppercase">
            Choose a new password
          </DialogTitle>
          <DialogDescription className="text-sm font-medium text-[var(--clue-text-muted)]">
            You opened the reset link from your email. Set a new password for your account.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(ev) => void handleSubmit(ev)} className="flex flex-col gap-4">
          <div className="space-y-2">
            <Label htmlFor="reset-password">New password</Label>
            <div className="relative">
              <Input
                id="reset-password"
                name="new-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                required
                minLength={6}
                value={password}
                onChange={(ev) => setPassword(ev.target.value)}
                placeholder="••••••••"
                className="border-2 border-[var(--clue-border)] bg-[var(--clue-surface)] pr-11"
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-[var(--clue-text-subtle)] transition-colors hover:text-[var(--clue-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--clue-focus)] focus-visible:ring-offset-2"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={
                  showPassword ? 'Hide password fields' : 'Show password fields'
                }
                aria-pressed={showPassword}
              >
                {showPassword ? (
                  <EyeOff className="h-5 w-5 shrink-0" strokeWidth={2} aria-hidden />
                ) : (
                  <Eye className="h-5 w-5 shrink-0" strokeWidth={2} aria-hidden />
                )}
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="reset-password-confirm">Confirm password</Label>
            <Input
              id="reset-password-confirm"
              name="confirm-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              required
              minLength={6}
              value={confirm}
              onChange={(ev) => setConfirm(ev.target.value)}
              placeholder="••••••••"
              className="border-2 border-[var(--clue-border)] bg-[var(--clue-surface)]"
            />
          </div>

          {formError && (
            <p className="text-sm font-semibold text-red-700" role="alert">
              {formError}
            </p>
          )}

          <Button
            type="submit"
            disabled={busy}
            className="h-11 border-2 border-[var(--clue-border)] bg-[var(--clue-inverse)] text-[var(--clue-inverse-text)] hover:opacity-90 font-bold tracking-wide"
          >
            {busy ? 'Please wait…' : 'Update password'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
