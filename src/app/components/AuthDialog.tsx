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
        setFormError(error.message);
        return;
      }
      const {
        data: { user },
      } = await supabase.auth.getUser();
      // Close immediately — do not await onSignedIn (hydrate / router.refresh can hang or feel slow).
      onOpenChange(false);
      setPassword('');
      if (user) {
        void Promise.resolve(onSignedIn?.()).catch((err) => {
          console.error('onSignedIn failed', err);
        });
      }
    } catch (err) {
      console.error('signInWithPassword threw', err);
      setFormError(
        err instanceof Error && err.message
          ? err.message
          : 'Could not sign in. Check your connection and try again.'
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
        setFormError(error.message);
        return;
      }
      if (data.session?.user) {
        if (name) {
          await updateProfile(supabase, data.session.user.id, { display_name: name });
        }
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
        err instanceof Error && err.message
          ? err.message
          : 'Could not create account. Check your connection and try again.'
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
        setFormError(error.message);
        return;
      }
      setInfoMessage('If an account exists for that email, you will receive a reset link shortly.');
    } catch (err) {
      console.error('resetPasswordForEmail threw', err);
      setFormError(
        err instanceof Error && err.message
          ? err.message
          : 'Could not send reset link. Check your connection and try again.'
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
        className="border-[3px] border-black shadow-[8px_8px_0_#000] sm:max-w-md"
        style={{ background: '#FFF5FA' }}
      >
        <DialogHeader>
          <DialogTitle className="text-xl font-black tracking-tight uppercase">
            {mode === 'forgot' ? 'Reset password' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </DialogTitle>
          <DialogDescription className="text-sm font-medium text-black/70">
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
                className="border-2 border-black bg-white"
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
              className="border-2 border-black bg-white"
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
                  className="border-2 border-black bg-white pr-11"
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-black/60 transition-colors hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
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
                className="text-sm font-medium text-black/80 overflow-hidden"
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
            className="h-11 border-2 border-black bg-black text-white hover:bg-black/90 font-bold tracking-wide"
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
            className="text-xs font-bold text-black/70 underline underline-offset-2 hover:text-black disabled:opacity-50"
          >
            Forgot password?
          </button>
        )}

        <p className="text-center text-sm font-medium text-black/70">
          {mode === 'forgot' ? (
            <>
              <button
                type="button"
                className="font-bold text-black underline underline-offset-2"
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
                className="font-bold text-black underline underline-offset-2"
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
                className="font-bold text-black underline underline-offset-2"
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
