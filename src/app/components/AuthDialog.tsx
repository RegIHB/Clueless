'use client';

import { useEffect, useState } from 'react';
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
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { updateProfile } from '@/lib/supabase/sync';

type Mode = 'signin' | 'signup';

type AuthDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When the dialog opens, start on this tab (matches “Sign in” vs “Create account” CTAs). */
  initialMode?: Mode;
  /** Run after email sign-in / sign-up returns a session so UI updates without a full reload. */
  onSignedIn?: () => void | Promise<void>;
};

export function AuthDialog({ open, onOpenChange, initialMode = 'signin', onSignedIn }: AuthDialogProps) {
  const [mode, setMode] = useState<Mode>(initialMode);

  useEffect(() => {
    if (open) {
      setMode(initialMode);
    }
  }, [open, initialMode]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
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
          emailRedirectTo:
            typeof window !== 'undefined' ? `${window.location.origin}/` : undefined,
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
    } finally {
      setBusy(false);
    }
  };

  const handleResetPassword = async () => {
    resetMessages();
    const trimmed = email.trim();
    if (!trimmed) {
      setFormError('Enter your email above first.');
      return;
    }
    setBusy(true);
    try {
      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
        redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/` : undefined,
      });
      if (error) {
        setFormError(error.message);
        return;
      }
      setInfoMessage('If an account exists for that email, you will receive a reset link shortly.');
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
        }
      }}
    >
      <DialogContent
        className="border-[3px] border-black shadow-[8px_8px_0_#000] sm:max-w-md"
        style={{ background: '#FFF5FA' }}
      >
        <DialogHeader>
          <DialogTitle className="text-xl font-black tracking-tight uppercase">
            {mode === 'signin' ? 'Sign in' : 'Create account'}
          </DialogTitle>
          <DialogDescription className="text-sm font-medium text-black/70">
            {mode === 'signin'
              ? 'Use the email and password for your Clueless account.'
              : 'Sign up to sync your wardrobe and saved outfits across devices.'}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={mode === 'signin' ? handleSignIn : handleSignUp}
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
              onChange={(ev) => setEmail(ev.target.value)}
              placeholder="you@example.com"
              className="border-2 border-black bg-white"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="auth-password">Password</Label>
            <Input
              id="auth-password"
              name="password"
              type="password"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              required
              value={password}
              onChange={(ev) => setPassword(ev.target.value)}
              placeholder="••••••••"
              minLength={mode === 'signup' ? 6 : undefined}
              className="border-2 border-black bg-white"
            />
          </div>

          {formError && (
            <p className="text-sm font-semibold text-red-700" role="alert">
              {formError}
            </p>
          )}
          {infoMessage && (
            <p className="text-sm font-medium text-black/80" role="status">
              {infoMessage}
            </p>
          )}

          <Button
            type="submit"
            disabled={busy}
            className="h-11 border-2 border-black bg-black text-white hover:bg-black/90 font-bold tracking-wide"
          >
            {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </Button>
        </form>

        {mode === 'signin' && (
          <button
            type="button"
            onClick={() => void handleResetPassword()}
            disabled={busy}
            className="text-xs font-bold text-black/70 underline underline-offset-2 hover:text-black disabled:opacity-50"
          >
            Forgot password?
          </button>
        )}

        <p className="text-center text-sm font-medium text-black/70">
          {mode === 'signin' ? (
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
