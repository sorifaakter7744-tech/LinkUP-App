import React, { useState } from 'react';
import {
  User,
  AtSign,
  Radio,
  EyeOff,
  LogOut,
  Shield,
  CheckCircle2,
  Navigation,
  Save,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import {
  AVATAR_COLORS,
  BackgroundPermissionStatusType,
  PermissionStatusType,
  UserProfile,
} from '../types';
import {
  formatRelativeTime,
  getInitials,
  sanitizeUsername,
} from '../utils/geo';

interface SettingsTabProps {
  profile: UserProfile;
  myCoords: {
    latitude: number;
    longitude: number;
    accuracy: number;
    updatedAtMs: number;
  } | null;
  permissionStatus: PermissionStatusType;
  backgroundPermissionStatus?: BackgroundPermissionStatusType;
  onUpdateProfile: (
    newName: string,
    newUsername: string,
    newColor: string
  ) => Promise<void>;
  onToggleSharing: () => Promise<void>;
  onRequestPermission: () => void;
  onLogout: () => Promise<void>;
}

export const SettingsTab: React.FC<SettingsTabProps> = ({
  profile,
  myCoords,
  permissionStatus,
  backgroundPermissionStatus = 'prompt',
  onUpdateProfile,
  onToggleSharing,
  onRequestPermission,
  onLogout,
}) => {
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [username, setUsername] = useState(profile.username);
  const [avatarColor, setAvatarColor] = useState(profile.avatarColor);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSaveMessage(null);

    const trimmedName = displayName.trim();
    const cleanUsername = sanitizeUsername(username);

    if (!trimmedName) {
      setErrorMsg('Name cannot be empty.');
      return;
    }
    if (cleanUsername.length < 2) {
      setErrorMsg('Username must be at least 2 characters.');
      return;
    }

    setSaving(true);
    try {
      await onUpdateProfile(trimmedName, cleanUsername, avatarColor);
      setSaveMessage('Profile updated! Your friends will see your new name & pin.');
      setTimeout(() => setSaveMessage(null), 3500);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to update profile.');
    } finally {
      setSaving(false);
    }
  };

  const myTimeInfo = myCoords
    ? formatRelativeTime(myCoords.updatedAtMs)
    : null;

  return (
    <div className="h-full overflow-y-auto bg-slate-950 p-4 sm:p-5 pb-24 space-y-5">
      <div className="max-w-2xl mx-auto space-y-5">
        {/* 1. Location Sharing ON / OFF Master Control */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div
                className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 border ${
                  profile.sharingEnabled
                    ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                    : 'bg-slate-800 border-slate-700 text-slate-400'
                }`}
              >
                {profile.sharingEnabled ? (
                  <Radio className="w-5 h-5 animate-pulse" />
                ) : (
                  <EyeOff className="w-5 h-5" />
                )}
              </div>
              <div>
                <h2 className="text-base font-extrabold text-white">
                  Location Sharing: {profile.sharingEnabled ? 'ON' : 'OFF'}
                </h2>
                <p className="text-xs text-slate-400 leading-relaxed mt-0.5">
                  {profile.sharingEnabled
                    ? 'Adaptive GPS sharing active (15–30s when moving, battery-saving when stationary).'
                    : 'Location sharing is OFF. All GPS updates are stopped and your pin is hidden.'}
                </p>
              </div>
            </div>

            {/* Android Material 3 Switch */}
            <button
              type="button"
              role="switch"
              aria-checked={profile.sharingEnabled}
              onClick={onToggleSharing}
              className={`relative w-14 h-8 rounded-full transition-colors cursor-pointer shrink-0 p-1 ${
                profile.sharingEnabled ? 'bg-emerald-500' : 'bg-slate-800'
              }`}
            >
              <span
                className={`block w-6 h-6 rounded-full bg-white shadow-md transition-transform ${
                  profile.sharingEnabled ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Android GPS Permission & Background Status */}
          <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5">
              <Navigation className="w-4 h-4 text-emerald-400 shrink-0" />
              <div className="space-y-0.5">
                <div className="font-bold text-slate-200">
                  Foreground GPS:{' '}
                  <span
                    className={
                      permissionStatus === 'granted'
                        ? 'text-emerald-400'
                        : 'text-amber-400'
                    }
                  >
                    {permissionStatus.toUpperCase()}
                  </span>
                  {' • '}
                  Background Mode:{' '}
                  <span
                    className={
                      backgroundPermissionStatus === 'granted'
                        ? 'text-emerald-400'
                        : 'text-amber-400'
                    }
                  >
                    {backgroundPermissionStatus.toUpperCase()}
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 font-mono-tech">
                  {myCoords && myTimeInfo
                    ? `Last GPS fix: ${myTimeInfo.relative} (±${Math.round(
                        myCoords.accuracy
                      )}m)`
                    : profile.sharingEnabled
                    ? 'Waiting for GPS fix...'
                    : 'All GPS updates stopped (Sharing OFF)'}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={onRequestPermission}
              className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shrink-0 transition cursor-pointer"
            >
              Configure Permissions
            </button>
          </div>
        </div>

        {/* 2. Name & Profile Settings */}
        <form
          onSubmit={handleSaveProfile}
          className="bg-slate-900/90 border border-slate-800 rounded-3xl p-4 sm:p-5 space-y-4"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center text-base font-extrabold text-slate-950 border-2 border-white shadow"
                style={{ backgroundColor: avatarColor }}
              >
                {getInitials(displayName || profile.displayName)}
              </div>
              <div>
                <h2 className="text-base font-extrabold text-white">
                  Name &amp; Profile
                </h2>
                <p className="text-xs text-slate-400 font-mono-tech">
                  @{sanitizeUsername(username) || profile.username}
                </p>
              </div>
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {saveMessage && (
            <div className="p-3 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{saveMessage}</span>
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Name
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  maxLength={50}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-2xl pl-10 pr-4 py-3 text-sm text-white focus:outline-none transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Username
              </label>
              <div className="relative">
                <AtSign className="w-4 h-4 text-emerald-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  maxLength={28}
                  value={username}
                  onChange={(e) =>
                    setUsername(sanitizeUsername(e.target.value))
                  }
                  className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-2xl pl-10 pr-4 py-3 text-sm font-mono-tech text-white focus:outline-none transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                Pin &amp; Avatar Color
              </label>
              <div className="flex items-center gap-2.5 flex-wrap">
                {AVATAR_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setAvatarColor(c)}
                    className={`w-8 h-8 rounded-full transition cursor-pointer ${
                      avatarColor === c
                        ? 'scale-110 ring-2 ring-white ring-offset-2 ring-offset-slate-900'
                        : 'opacity-75 hover:opacity-100'
                    }`}
                    style={{ backgroundColor: c }}
                    aria-label={`Choose color ${c}`}
                  />
                ))}
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full py-3 px-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 transition cursor-pointer"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Save Name &amp; Profile</span>
              </>
            )}
          </button>
        </form>

        {/* 3. Privacy, Credit & Logout */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-4 sm:p-5 space-y-4">
          <div className="flex items-start gap-3">
            <Shield className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div className="space-y-1 text-xs text-slate-400 leading-relaxed">
              <div className="font-bold text-white">
                Privacy &amp; Web / PWA Platform Limitations
              </div>
              <p>
                LinkUp shares your real GPS location only with accepted friends while Location Sharing is ON. To save battery, high-accuracy GPS is used when moving and reduced when stationary. In web/PWA environments, browsers pause geolocation if the app or browser is completely closed and automatically resume when you reopen LinkUp. Turning Location Sharing OFF or logging out immediately stops GPS requests and deletes your live location record.
              </p>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <span>App Developer Attribution</span>
            <span className="font-bold text-emerald-400">Credit: Sakib</span>
          </div>

          <button
            type="button"
            onClick={onLogout}
            className="w-full py-3 px-4 rounded-2xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 font-bold text-sm flex items-center justify-center gap-2 transition cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Logout of LinkUp</span>
          </button>
        </div>
      </div>
    </div>
  );
};
