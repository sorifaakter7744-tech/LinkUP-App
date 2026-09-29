import React, { useState } from 'react';
import {
  MapPin,
  ShieldCheck,
  User,
  AtSign,
  Mail,
  Lock,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { User as FirebaseUser } from 'firebase/auth';
import {
  auth,
  googleProvider,
  signInWithPopup,
  createOrUpdateUserProfile,
  formatAuthOrFirestoreError,
} from '../firebase';
import { AVATAR_COLORS, UserProfile } from '../types';
import { sanitizeUsername } from '../utils/geo';

interface AuthScreenProps {
  firebaseUser: FirebaseUser | null;
  onProfileCreated: (profile: UserProfile) => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({
  firebaseUser,
  onProfileCreated,
}) => {
  const [mode, setMode] = useState<'login' | 'signup'>('signup');
  const [displayName, setDisplayName] = useState(
    firebaseUser?.displayName || ''
  );
  const [username, setUsername] = useState(
    firebaseUser?.email
      ? sanitizeUsername(firebaseUser.email.split('@')[0])
      : ''
  );
  const [email, setEmail] = useState(firebaseUser?.email || '');
  const [password, setPassword] = useState('');
  const [avatarColor, setAvatarColor] = useState(AVATAR_COLORS[0]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Unified Google Sign-In + Firestore Profile Create/Update + Navigate to Home/Map
  const handleGoogleSignIn = async () => {
    setErrorMsg(null);
    setLoading(true);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      if (!cred.user) {
        throw new Error('No user returned from Google Sign-In.');
      }

      const savedProfile = await createOrUpdateUserProfile(cred.user, {
        preferredName: displayName.trim(),
        preferredUsername: sanitizeUsername(username),
        preferredColor: avatarColor,
      });

      onProfileCreated(savedProfile);
    } catch (err: any) {
      console.error('Google Sign-In / Profile creation error:', err);
      setErrorMsg(formatAuthOrFirestoreError(err));
    } finally {
      setLoading(false);
    }
  };

  // Complete profile creation if user is already authenticated with Firebase
  const handleCompleteOnboarding = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);

    try {
      const activeUser = firebaseUser || auth.currentUser;
      if (!activeUser) {
        const cred = await signInWithPopup(auth, googleProvider);
        const savedProfile = await createOrUpdateUserProfile(cred.user, {
          preferredName: displayName.trim(),
          preferredUsername: sanitizeUsername(username),
          preferredColor: avatarColor,
        });
        onProfileCreated(savedProfile);
        return;
      }

      const savedProfile = await createOrUpdateUserProfile(activeUser, {
        preferredName: displayName.trim(),
        preferredUsername: sanitizeUsername(username),
        preferredColor: avatarColor,
      });
      onProfileCreated(savedProfile);
    } catch (err: any) {
      console.error('Complete onboarding error:', err);
      setErrorMsg(formatAuthOrFirestoreError(err));
    } finally {
      setLoading(false);
    }
  };

  // Form submit handler for "Create Account" / "Log In to Account" using connected Google Auth
  const handleCreateAccountOrLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);

    try {
      let activeUser = firebaseUser || auth.currentUser;
      if (!activeUser) {
        const cred = await signInWithPopup(auth, googleProvider);
        activeUser = cred.user;
      }

      if (!activeUser) {
        throw new Error('Authentication did not return a valid user.');
      }

      const savedProfile = await createOrUpdateUserProfile(activeUser, {
        preferredName: displayName.trim(),
        preferredUsername: sanitizeUsername(username),
        preferredColor: avatarColor,
      });

      onProfileCreated(savedProfile);
    } catch (err: any) {
      console.error('Create Account / Login error:', err);
      setErrorMsg(formatAuthOrFirestoreError(err));
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Authenticated via Google (if profile doc wasn't created yet)
  if (firebaseUser) {
    return (
      <div className="min-h-dvh bg-slate-950 text-slate-100 flex flex-col justify-between p-5 overflow-y-auto">
        <div className="max-w-md w-full mx-auto my-auto py-6 space-y-6">
          <div className="flex items-center justify-between">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-xs font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Account Authenticated
            </div>
            <span className="text-xs font-medium text-slate-400 bg-slate-900 px-3 py-1 rounded-full border border-slate-800">
              Credit: Sakib
            </span>
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-extrabold tracking-tight text-white">
              Set Up Your Profile
            </h1>
            <p className="text-sm text-slate-400">
              Confirm your display name and username so your friends can find and add you.
            </p>
          </div>

          {errorMsg && (
            <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form
            onSubmit={handleCompleteOnboarding}
            className="bg-slate-900/90 border border-slate-800/90 rounded-3xl p-5 space-y-4 shadow-xl"
          >
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Your Name
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  maxLength={50}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={firebaseUser.displayName || 'e.g. Sakib Ahmed'}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-2xl pl-10 pr-4 py-3 text-sm text-white placeholder:text-slate-600 focus:outline-none transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Unique Username (for friend search)
              </label>
              <div className="relative">
                <AtSign className="w-4 h-4 text-emerald-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  maxLength={28}
                  value={username}
                  onChange={(e) => setUsername(sanitizeUsername(e.target.value))}
                  placeholder="sakib"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-2xl pl-10 pr-4 py-3 text-sm font-mono-tech text-white placeholder:text-slate-600 focus:outline-none transition"
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Friends will search for{' '}
                <span className="text-emerald-400 font-mono-tech">
                  @{sanitizeUsername(username) || 'username'}
                </span>{' '}
                to send you a friend request.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                Map Marker Color
              </label>
              <div className="flex items-center gap-2.5 flex-wrap">
                {AVATAR_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setAvatarColor(color)}
                    className={`w-8 h-8 rounded-full transition-transform cursor-pointer flex items-center justify-center ${
                      avatarColor === color
                        ? 'scale-110 ring-2 ring-white ring-offset-2 ring-offset-slate-900'
                        : 'opacity-75 hover:opacity-100'
                    }`}
                    style={{ backgroundColor: color }}
                    aria-label={`Select color ${color}`}
                  />
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 px-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition cursor-pointer mt-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Saving Profile...</span>
                </>
              ) : (
                <>
                  <span>Continue to LinkUp</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Step 1: Unauthenticated -> Sign Up / Log In screen
  return (
    <div className="min-h-dvh bg-slate-950 text-slate-100 flex flex-col justify-between p-4 sm:p-6 overflow-y-auto">
      <div className="max-w-md w-full mx-auto my-auto py-4 space-y-5">
        {/* Top Header & Credit */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-lg shadow-emerald-500/10">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-extrabold tracking-tight text-white leading-none">
                LinkUp
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Private Friends-Only Live GPS
              </p>
            </div>
          </div>
          <div className="px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-[11px] font-semibold text-emerald-400">
            Credit: Sakib
          </div>
        </div>

        {/* Privacy Promise Pill */}
        <div className="p-3.5 rounded-2xl bg-slate-900/70 border border-slate-800/80 flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <div className="text-xs text-slate-300 leading-relaxed">
            <span className="font-semibold text-white">100% Private &amp; Free:</span>{' '}
            Your GPS location is never public. Only accepted friends can see your marker, and only while your Location Sharing switch is turned ON.
          </div>
        </div>

        {errorMsg && (
          <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Google 1-Tap Sign In */}
        <div className="space-y-2">
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full py-3.5 px-4 rounded-2xl bg-white hover:bg-slate-100 disabled:opacity-50 text-slate-950 font-bold text-sm flex items-center justify-center gap-3 shadow-lg transition cursor-pointer"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
            ) : (
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
            )}
            <span>
              {loading
                ? 'Connecting to Google...'
                : 'Continue with Google (Instant Setup)'}
            </span>
          </button>
        </div>

        <div className="relative flex items-center justify-center">
          <div className="border-t border-slate-800 w-full" />
          <span className="bg-slate-950 px-3 text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
            or customize profile first
          </span>
          <div className="border-t border-slate-800 w-full" />
        </div>

        {/* Mode Switcher */}
        <div className="grid grid-cols-2 p-1 bg-slate-900 rounded-2xl border border-slate-800">
          <button
            type="button"
            onClick={() => {
              setMode('signup');
              setErrorMsg(null);
            }}
            className={`py-2 text-xs font-bold rounded-xl transition cursor-pointer ${
              mode === 'signup'
                ? 'bg-emerald-500 text-slate-950 shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Create Account
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setErrorMsg(null);
            }}
            className={`py-2 text-xs font-bold rounded-xl transition cursor-pointer ${
              mode === 'login'
                ? 'bg-emerald-500 text-slate-950 shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Log In
          </button>
        </div>

        <form
          onSubmit={handleCreateAccountOrLogin}
          className="bg-slate-900/80 border border-slate-800/90 rounded-3xl p-4 sm:p-5 space-y-3.5"
        >
          {mode === 'signup' && (
            <>
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Your Name
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    maxLength={50}
                    value={displayName}
                    onChange={(e) => {
                      setDisplayName(e.target.value);
                      if (!username) {
                        setUsername(sanitizeUsername(e.target.value));
                      }
                    }}
                    placeholder="Enter your full name"
                    className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl pl-10 pr-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Username (for friend search)
                </label>
                <div className="relative">
                  <AtSign className="w-4 h-4 text-emerald-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    maxLength={28}
                    value={username}
                    onChange={(e) =>
                      setUsername(sanitizeUsername(e.target.value))
                    }
                    placeholder="e.g. sakib_99"
                    className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl pl-10 pr-3 py-2.5 text-sm font-mono-tech text-white placeholder:text-slate-600 focus:outline-none"
                  />
                </div>
              </div>
            </>
          )}

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
              Email Address (Optional - Linked via Google)
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@gmail.com"
                className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl pl-10 pr-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
              Password (Optional with Google Auth)
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Authenticated via Google Sign-In"
                className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl pl-10 pr-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 transition cursor-pointer"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Authenticating with Google...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>
                  {mode === 'signup' ? 'Create Account' : 'Log In to Account'}
                </span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
