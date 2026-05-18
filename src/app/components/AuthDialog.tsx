'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
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
import { getAuthEmailRedirectUrl } from '@/lib/site-url';
import { updateProfile } from '@/lib/supabase/sync';
import { getSessionOrchestrator } from '@/lib/auth/session-orchestrator';

/** Map raw Supabase auth errors to user-friendly messages without leaking server detail. */
function classifyAuthError(message: string | undefined): string {
  if (!message) return 'Could not complete that action. Please try again.';
  const m = message.toLowerCase();
  if (m.includes('invalid login') || m.includes('invalid_credentials')) {
    return 'Email or password is incorrect.';
  }
  if (m.includes('email not confirmed')) {
    return 'Please confirm your email before signing in. Check your inbox for the link.';
  }
  if (m.includes('rate limit') || m.includes('too many requests')) {
    return 'Too many attempts. Wait a moment and try again.';
  }
  if (m.includes('network') || m.includes('failed to fetch')) {
    return 'Network issue. Check your connection and try again.';
  }
  if (m.includes('user already registered') || m.includes('already exists')) {
    return 'An account already exists for that email. Try signing in or resetting your password.';
  }
  return message;
}

type Mode = 'signin' | 'signup' | 'forgot';

type AuthDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When the dialog opens, start on this tab (matches “Sign in” vs “Create account” CTAs). */
  initialMode?: 'signin' | 'signup' | 'forgot';
  /** Run after email sign-in / sign-up returns a session so UI updates without a full reload. */
  onSignedIn?: () => void | Promise<void>;
};

export function AuthDialog({ open, onOpenChange, initialMode = 'signin', onSignedIn }: AuthDialogProps) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [displayName, setDisplayName] = useState('');

  useEffect(() => {
    if (open) {
      setMode(initialMode);
      setShowPassword(false);
    }
  }, [open, initialMode]);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const resetMessages = () => {
    setFormError(null);
    setInfoMessage(null);
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();
    setBusy(true);
    try {
      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        setFormError(classifyAuthError(error.message));
        return;
      }
      // Notify the orchestrator so app state updates immediately without waiting
      // for the auth state event subscription to fire.
      void getSessionOrchestrator().refreshAfterCredentialSignIn();
      onOpenChange(false);
      setPassword('');
      void Promise.resolve(onSignedIn?.()).catch((err) => {
        console.error('onSignedIn failed', err);
      });
    } catch (err) {
      console.error('signInWithPassword threw', err);
      setFormError(
        classifyAuthError(err instanceof Error ? err.message : undefined)
      );
    } finally {
      setBusy(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();
    if (password.length < 6) {
      setFormError('Password must be at least 6 characters.');
      return;
    }
    setBusy(true);
    try {
      const supabase = createBrowserSupabaseClient();
      const name = displayName.trim();
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: getAuthEmailRedirectUrl(),
          data: name ? { display_name: name } : undefined,
        },
      });
      if (error) {
        setFormError(classifyAuthError(error.message));
        return;
      }
      if (data.session?.user) {
        if (name) {
          await updateProfile(supabase, data.session.user.id, { display_name: name });
        }
        void getSessionOrchestrator().refreshAfterCredentialSignIn();
        onOpenChange(false);
        setPassword('');
        setDisplayName('');
        void Promise.resolve(onSignedIn?.()).catch((err) => {
          console.error('onSignedIn failed', err);
        });
        return;
      }
      setInfoMessage(
        'Check your email for a confirmation link. After confirming, sign in here.'
      );
      setPassword('');
    } catch (err) {
      console.error('signUp threw', err);
      setFormError(
        classifyAuthError(err instanceof Error ? err.message : undefined)
      );
    } finally {
      setBusy(false);
    }
  };

  const handleResetPassword = async (e?: React.FormEvent) => {
    e?.preventDefault();
    resetMessages();
    const trimmed = email.trim();
    if (!trimmed) {
      setFormError('Enter your email address.');
      return;
    }
    setBusy(true);
    try {
      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
        redirectTo: getAuthEmailRedirectUrl(),
      });
      if (error) {
        setFormError(classifyAuthError(error.message));
        return;
      }
      setInfoMessage('If an account exists for that email, you will receive a reset link shortly.');
    } catch (err) {
      console.error('resetPasswordForEmail threw', err);
      setFormError(
        classifyAuthError(err instanceof Error ? err.message : undefined)
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          resetMessages();
          setPassword('');
          setShowPassword(false);
        }
      }}
    >
      <DialogContent
        className="border-[3px] border-[var(--clue-border)] shadow-[var(--clue-shadow-lg)] sm:max-w-md"
        style={{ background: 'var(--clue-surface-accent)' }}
      >
        <DialogHeader>
          <DialogTitle className="text-xl font-black tracking-tight uppercase">
            {mode === 'forgot' ? 'Reset password' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </DialogTitle>
          <DialogDescription className="text-sm font-medium text-[var(--clue-text-muted)]">
            {mode === 'forgot'
              ? 'Enter your email and we will send you a link to choose a new password.'
              : mode === 'signin'
                ? 'Use the email and password for your Clueless account.'
                : 'Sign up to sync your wardrobe and saved outfits across devices.'}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={
            mode === 'signin'
              ? handleSignIn
              : mode === 'signup'
                ? handleSignUp
                : (ev) => void handleResetPassword(ev)
          }
          className="flex flex-col gap-4"
        >
          {mode === 'signup' && (
            <div className="space-y-2">
              <Label htmlFor="auth-display-name">Display name</Label>
              <Input
                id="auth-display-name"
                name="displayName"
                autoComplete="name"
                value={displayName}
                onChange={(ev) => setDisplayName(ev.target.value)}
                placeholder="Alex"
                className="border-2 border-[var(--clue-border)] bg-[var(--clue-surface)]"
              />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="auth-email">Email</Label>
            <Input
              id="auth-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(ev) => {
                setEmail(ev.target.value);
                if (formError) setFormError(null);
              }}
              placeholder="you@example.com"
              aria-invalid={formError ? true : undefined}
              className="border-2 border-[var(--clue-border)] bg-[var(--clue-surface)]"
            />
          </div>
          {mode !== 'forgot' && (
            <div className="space-y-2">
              <Label htmlFor="auth-password">Password</Label>
              <div className="relative">
                <Input
                  id="auth-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  required
                  value={password}
                  onChange={(ev) => {
                    setPassword(ev.target.value);
                    if (formError) setFormError(null);
                  }}
                  placeholder="••••••••"
                  minLength={mode === 'signup' ? 6 : undefined}
                  aria-invalid={formError ? true : undefined}
                  className="border-2 border-[var(--clue-border)] bg-[var(--clue-surface)] pr-11"
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-[var(--clue-text-subtle)] transition-colors hover:text-[var(--clue-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--clue-focus)] focus-visible:ring-offset-2"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
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
          )}

          <AnimatePresence mode="wait" initial={false}>
            {formError && (
              <motion.p
                key="form-error"
                initial={{ opacity: 0, y: -4, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, y: -4, height: 0 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                className="text-sm font-semibold text-red-700 overflow-hidden"
                role="alert"
                aria-live="assertive"
              >
                {formError}
              </motion.p>
            )}
            {infoMessage && (
              <motion.p
                key="form-info"
                initial={{ opacity: 0, y: -4, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, y: -4, height: 0 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                className="text-sm font-medium text-[var(--clue-text-muted)] overflow-hidden"
                role="status"
                aria-live="polite"
              >
                {infoMessage}
              </motion.p>
            )}
          </AnimatePresence>

          <Button
            type="submit"
            loading={busy}
            disabled={busy}
            className="h-11 border-2 border-[var(--clue-border)] bg-[var(--clue-inverse)] text-[var(--clue-inverse-text)] hover:opacity-90 font-bold tracking-wide"
          >
            {busy
              ? 'Please wait…'
              : mode === 'signin'
                ? 'Sign in'
                : mode === 'signup'
                  ? 'Create account'
                  : 'Send reset link'}
          </Button>
        </form>

        {mode === 'signin' && (
          <button
            type="button"
            onClick={() => {
              resetMessages();
              setMode('forgot');
            }}
            disabled={busy}
            className="text-xs font-bold text-[var(--clue-text-muted)] underline underline-offset-2 hover:text-[var(--clue-text)] disabled:opacity-50"
          >
            Forgot password?
          </button>
        )}

        <p className="text-center text-sm font-medium text-[var(--clue-text-muted)]">
          {mode === 'forgot' ? (
            <>
              <button
                type="button"
                className="font-bold text-[var(--clue-text)] underline underline-offset-2"
                onClick={() => {
                  resetMessages();
                  setMode('signin');
                }}
              >
                Back to sign in
              </button>
            </>
          ) : mode === 'signin' ? (
            <>
              No account?{' '}
              <button
                type="button"
                className="font-bold text-[var(--clue-text)] underline underline-offset-2"
                onClick={() => {
                  resetMessages();
                  setMode('signup');
                }}
              >
                Sign up
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button
                type="button"
                className="font-bold text-[var(--clue-text)] underline underline-offset-2"
                onClick={() => {
                  resetMessages();
                  setMode('signin');
                }}
              >
                Sign in
              </button>
            </>
          )}
        </p>
      </DialogContent>
    </Dialog>
  );
}
