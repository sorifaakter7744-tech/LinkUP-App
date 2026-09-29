import React from 'react';
import {
  Navigation,
  Shield,
  Lock,
  CheckCircle2,
  AlertTriangle,
  X,
  Radio,
} from 'lucide-react';
import {
  BackgroundPermissionStatusType,
  PermissionStatusType,
} from '../types';

interface PermissionSheetProps {
  permissionStatus: PermissionStatusType;
  backgroundPermissionStatus?: BackgroundPermissionStatusType;
  gpsError: string | null;
  onRequestPermission: (enableBackground?: boolean) => void;
  onDenyBackgroundPermission?: () => void;
  onDismiss?: () => void;
}

export const PermissionSheet: React.FC<PermissionSheetProps> = ({
  permissionStatus,
  backgroundPermissionStatus = 'prompt',
  gpsError,
  onRequestPermission,
  onDenyBackgroundPermission,
  onDismiss,
}) => {
  return (
    <div className="fixed inset-0 z-[1000] bg-slate-950/80 backdrop-blur-md flex items-end sm:items-center justify-center p-4">
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-200">
        <div className="flex items-start justify-between">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Navigation className="w-6 h-6" />
          </div>
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              aria-label="Close permission dialog"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <div className="space-y-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
            Device Location Permission &amp; Sharing Mode
          </span>
          <h2 className="text-xl font-extrabold text-white">
            Allow LinkUp to access this device&apos;s GPS?
          </h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            LinkUp uses real device GPS to share your live coordinates with your accepted friends when Location Sharing is ON.
          </p>
        </div>

        {/* Visual Adaptive GPS + Privacy explanation */}
        <div className="grid grid-cols-2 gap-3 pt-1">
          <div className="p-3 rounded-2xl bg-slate-950 border border-emerald-500/40 flex flex-col items-center text-center gap-1.5">
            <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <span className="text-xs font-bold text-white">Battery-Smart GPS</span>
            <span className="text-[11px] text-slate-400">
              High accuracy when moving; low-power mode when stationary
            </span>
          </div>

          <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col items-center text-center gap-1.5">
            <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400">
              <Shield className="w-4 h-4" />
            </div>
            <span className="text-xs font-bold text-white">Friends Only</span>
            <span className="text-[11px] text-slate-400">
              Immediately stops &amp; removes pin when Sharing is OFF
            </span>
          </div>
        </div>

        {/* Transparent explanation of Web/PWA platform behavior & limitations */}
        <div className="p-3 rounded-2xl bg-slate-950/70 border border-slate-800/80 flex items-start gap-2.5 text-[11px] text-slate-400 leading-relaxed">
          <Lock className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <span>
            <strong className="text-slate-200">
              Web / PWA Platform Limitation:
            </strong>{' '}
            LinkUp uses Screen Wake Lock and visibility auto-resume to keep your location updated while the app is open, and continues when briefly backgrounded where your browser/OS permits. Because web browsers suspend geolocation when a tab or browser is completely closed, live updates pause if the app is fully closed and automatically resume as soon as you reopen LinkUp.
          </span>
        </div>

        {(permissionStatus === 'denied' ||
          backgroundPermissionStatus === 'denied' ||
          gpsError) && (
          <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-amber-300">
                {gpsError ||
                  (permissionStatus === 'denied'
                    ? 'Location permission is currently denied'
                    : 'Tab-switch updates are currently paused (Foreground Tab Only)')}
              </p>
              <p className="text-[11px] text-amber-200/80">
                If location access is blocked, open your browser/device Site Settings &rarr; Permissions &rarr; Location and select &quot;Allow&quot;, then tap below.
              </p>
            </div>
          </div>
        )}

        <div className="space-y-2 pt-1">
          <button
            type="button"
            onClick={() => onRequestPermission(true)}
            className="w-full py-3.5 px-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 transition cursor-pointer shadow-lg shadow-emerald-500/20"
          >
            <Radio className="w-4 h-4" />
            <span>Allow GPS (Keep Active + Auto-Resume)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (onDenyBackgroundPermission) {
                onDenyBackgroundPermission();
              }
              onRequestPermission(false);
            }}
            className="w-full py-2.5 px-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition cursor-pointer"
          >
            Foreground tab only (Pause immediately when tab is hidden)
          </button>

          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className="w-full py-2 px-4 rounded-2xl bg-slate-900/70 hover:bg-slate-800/70 text-slate-400 font-semibold text-xs transition cursor-pointer"
            >
              Not now
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
