/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  Map,
  Users,
  Bell,
  Settings,
  Loader2,
  MapPin,
} from 'lucide-react';
import {
  auth,
  db,
  firebaseSignOut,
  handleFirestoreError,
  testFirestoreConnection,
} from './firebase';
import {
  BackgroundPermissionStatusType,
  FriendRequest,
  NavigationTab,
  OperationType,
  PermissionStatusType,
  UserLocation,
  UserProfile,
} from './types';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AuthScreen } from './components/AuthScreen';
import { PermissionSheet } from './components/PermissionSheet';
import { MapView } from './components/MapView';
import { FriendsTab } from './components/FriendsTab';
import { RequestsTab } from './components/RequestsTab';
import { SettingsTab } from './components/SettingsTab';
import { calculateDistanceMeters, sanitizeUsername } from './utils/geo';

const BG_PERMISSION_STORAGE_KEY = 'linkup_bg_location_permission';
// Adaptive intervals & stationary thresholds for battery and data efficiency
const MOVING_UPDATE_INTERVAL_MS = 15000; // 15s while actively moving fast
const MODERATE_MOVING_UPDATE_INTERVAL_MS = 25000; // 25s while moving moderately
const STATIONARY_POLL_INTERVAL_MS = 60000; // 60s low-power check when stationary
const STATIONARY_FIRESTORE_HEARTBEAT_MS = 150000; // 2.5m Firestore write interval when stationary
const STATIONARY_DISTANCE_THRESHOLD_METERS = 12; // < 12m movement treated as stationary
const LOW_ACCURACY_THRESHOLD_METERS = 150; // > 150m accuracy warns user of weak GPS signal

type LocalCoords = {
  latitude: number;
  longitude: number;
  accuracy: number;
  heading: number | null;
  speed: number | null;
  updatedAtMs: number;
};

export function AppContent() {
  const [authReady, setAuthReady] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [initialProfileChecked, setInitialProfileChecked] = useState(false);

  const [activeTab, setActiveTab] = useState<NavigationTab>('map');
  const [focusedFriendUid, setFocusedFriendUid] = useState<string | null>(null);

  // Friend Requests & Accepted Friends
  const [incomingRequests, setIncomingRequests] = useState<FriendRequest[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<FriendRequest[]>([]);
  const [friendProfiles, setFriendProfiles] = useState<UserProfile[]>([]);
  const [friendLocations, setFriendLocations] = useState<
    Record<string, UserLocation>
  >({});

  // Browser / Device Real GPS & Permission State
  const [permissionStatus, setPermissionStatus] =
    useState<PermissionStatusType>('prompt');
  const [backgroundPermissionStatus, setBackgroundPermissionStatus] =
    useState<BackgroundPermissionStatusType>(() => {
      try {
        const saved = localStorage.getItem(BG_PERMISSION_STORAGE_KEY);
        if (saved === 'granted' || saved === 'denied' || saved === 'restricted') {
          return saved;
        }
      } catch {
        // ignore storage errors
      }
      return 'granted';
    });
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [myCoords, setMyCoords] = useState<LocalCoords | null>(null);

  const watchIdRef = useRef<number | null>(null);
  const adaptiveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wakeLockRef = useRef<any>(null);
  const stationaryCountRef = useRef<number>(0);
  const hasAutoPromptedPermissionRef = useRef<boolean>(false);

  const lastSyncedCoordsRef = useRef<{
    latitude: number;
    longitude: number;
    accuracy: number;
    timestamp: number;
  } | null>(null);
  const pendingOfflineCoordsRef = useRef<LocalCoords | null>(null);

  const myCoordsRef = useRef(myCoords);
  myCoordsRef.current = myCoords;

  const profileRef = useRef(profile);
  profileRef.current = profile;

  const isOnlineRef = useRef(isOnline);
  isOnlineRef.current = isOnline;

  const bgPermRef = useRef(backgroundPermissionStatus);
  bgPermRef.current = backgroundPermissionStatus;

  // Test Firestore connection on mount
  useEffect(() => {
    testFirestoreConnection();
  }, []);

  // Helper to stop all active GPS watchers, timers, and wake locks
  const stopAllGpsTracking = useCallback(() => {
    if (watchIdRef.current !== null && 'geolocation' in navigator) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (adaptiveTimerRef.current !== null) {
      clearTimeout(adaptiveTimerRef.current);
      adaptiveTimerRef.current = null;
    }
    if (wakeLockRef.current) {
      wakeLockRef.current.release?.().catch(() => {});
      wakeLockRef.current = null;
    }
    stationaryCountRef.current = 0;
  }, []);

  // 1. Listen to Firebase Authentication state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setAuthReady(true);
      if (!user) {
        stopAllGpsTracking();
        setProfile(null);
        setMyCoords(null);
        setInitialProfileChecked(true);
        setFriendProfiles([]);
        setFriendLocations({});
        setIncomingRequests([]);
        setOutgoingRequests([]);
      }
    });
    return () => unsub();
  }, [stopAllGpsTracking]);

  // 2. Listen to Current User's Profile document in Firestore
  useEffect(() => {
    if (!firebaseUser) {
      return;
    }

    const userDocRef = doc(db, 'users', firebaseUser.uid);
    const unsub = onSnapshot(
      userDocRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as UserProfile;
          setProfile(data);
          if (!data.sharingEnabled) {
            // Ensure local live map marker is hidden when Location Sharing is OFF
            setMyCoords(null);
            pendingOfflineCoordsRef.current = null;
          }
        }
        setInitialProfileChecked(true);
      },
      (err) => {
        setInitialProfileChecked(true);
        console.error('Error listening to user profile:', err);
      }
    );

    return () => unsub();
  }, [firebaseUser]);

  // 3. Listen to Incoming & Outgoing Friend Requests in real time
  useEffect(() => {
    if (!firebaseUser || !profile) return;

    const incomingQ = query(
      collection(db, 'friendRequests'),
      where('toUid', '==', firebaseUser.uid)
    );
    const outgoingQ = query(
      collection(db, 'friendRequests'),
      where('fromUid', '==', firebaseUser.uid)
    );

    const unsubIn = onSnapshot(
      incomingQ,
      (snap) => {
        const list: FriendRequest[] = [];
        snap.forEach((d) => {
          list.push({ id: d.id, ...(d.data() as Omit<FriendRequest, 'id'>) });
        });
        setIncomingRequests(list);
      },
      (err) =>
        handleFirestoreError(err, OperationType.LIST, 'friendRequests (incoming)')
    );

    const unsubOut = onSnapshot(
      outgoingQ,
      (snap) => {
        const list: FriendRequest[] = [];
        snap.forEach((d) => {
          list.push({ id: d.id, ...(d.data() as Omit<FriendRequest, 'id'>) });
        });
        setOutgoingRequests(list);
      },
      (err) =>
        handleFirestoreError(err, OperationType.LIST, 'friendRequests (outgoing)')
    );

    return () => {
      unsubIn();
      unsubOut();
    };
  }, [firebaseUser, profile?.uid]);

  // 4. Listen to Accepted Friends' Profiles & Private Live Locations in real time
  const friendsKey = profile?.friends ? [...profile.friends].sort().join(',') : '';

  useEffect(() => {
    if (!firebaseUser || !profile) {
      setFriendProfiles([]);
      setFriendLocations({});
      return;
    }

    const friendUids = profile.friends || [];
    if (friendUids.length === 0) {
      setFriendProfiles([]);
      setFriendLocations({});
      return;
    }

    const profileUnsubs: (() => void)[] = [];
    const locationUnsubs: (() => void)[] = [];

    const profilesMap: Record<string, UserProfile> = {};

    friendUids.forEach((fUid) => {
      // Listen to Friend's public profile
      const pUnsub = onSnapshot(
        doc(db, 'users', fUid),
        (snap) => {
          if (snap.exists()) {
            const friendData = snap.data() as UserProfile;
            profilesMap[fUid] = friendData;
            // Never show the location of a user who has disabled sharing
            if (!friendData.sharingEnabled) {
              setFriendLocations((prev) => {
                if (!(fUid in prev)) return prev;
                const next = { ...prev };
                delete next[fUid];
                return next;
              });
            }
          } else {
            delete profilesMap[fUid];
            setFriendLocations((prev) => {
              if (!(fUid in prev)) return prev;
              const next = { ...prev };
              delete next[fUid];
              return next;
            });
          }
          setFriendProfiles(
            Object.values(profilesMap).sort((a, b) =>
              a.displayName.localeCompare(b.displayName)
            )
          );
        },
        (err) => {
          console.warn('Could not read friend profile:', fUid, err);
        }
      );
      profileUnsubs.push(pUnsub);

      // Listen to Friend's private live GPS location document (`/locations/{fUid}`)
      const lUnsub = onSnapshot(
        doc(db, 'locations', fUid),
        (snap) => {
          setFriendLocations((prev) => {
            const next = { ...prev };
            if (snap.exists()) {
              const locData = snap.data() as UserLocation;
              if (locData.sharingEnabled) {
                next[fUid] = {
                  ...locData,
                  timestamp: locData.timestamp || locData.updatedAtMs || Date.now(),
                  updatedAtMs: locData.updatedAtMs || locData.timestamp || Date.now(),
                };
              } else {
                delete next[fUid];
              }
            } else {
              delete next[fUid];
            }
            return next;
          });
        },
        () => {
          // If friend turned sharing off or restricted access, immediately remove from map
          setFriendLocations((prev) => {
            if (!(fUid in prev)) return prev;
            const next = { ...prev };
            delete next[fUid];
            return next;
          });
        }
      );
      locationUnsubs.push(lUnsub);
    });

    return () => {
      profileUnsubs.forEach((u) => u());
      locationUnsubs.forEach((u) => u());
    };
  }, [firebaseUser, profile?.uid, friendsKey]);

  // 5. Battery- & Data-Efficient Firestore Sync (`/locations/{uid}` — single record per user)
  const syncMyLocationToFirestore = useCallback(
    async (
      coords: LocalCoords,
      currentProfile: UserProfile,
      forceWrite = false
    ) => {
      // Never publish location if Location Sharing is OFF
      if (!currentProfile.sharingEnabled) return;

      // Network resilience: if offline, cache latest local coordinates and sync when online returns
      if (!navigator.onLine || !isOnlineRef.current) {
        pendingOfflineCoordsRef.current = coords;
        setGpsError(
          'Internet unavailable. Keeping your last known location locally until connection returns.'
        );
        return;
      }

      // Respect user's Foreground Tab Only setting when tab is hidden
      if (
        typeof document !== 'undefined' &&
        document.visibilityState === 'hidden' &&
        bgPermRef.current === 'denied'
      ) {
        return;
      }

      const now = Date.now();
      const prev = lastSyncedCoordsRef.current;

      if (!forceWrite && prev) {
        const elapsedMs = now - prev.timestamp;
        const distanceMovedMeters = calculateDistanceMeters(
          prev.latitude,
          prev.longitude,
          coords.latitude,
          coords.longitude
        );
        const accuracyImprovedSignificantly =
          prev.accuracy - coords.accuracy >= 20;

        const isMovingActively =
          (coords.speed !== null && coords.speed >= 0.8) ||
          distanceMovedMeters >= STATIONARY_DISTANCE_THRESHOLD_METERS;

        // Avoid unnecessary Firestore writes:
        // - If moving: write at most every 15–25s
        // - If stationary (< 12m movement): only write every 2.5 minutes unless accuracy improved significantly
        const minIntervalMs = isMovingActively
          ? distanceMovedMeters >= 25 || (coords.speed ?? 0) > 2.0
            ? MOVING_UPDATE_INTERVAL_MS
            : MODERATE_MOVING_UPDATE_INTERVAL_MS
          : accuracyImprovedSignificantly
          ? MODERATE_MOVING_UPDATE_INTERVAL_MS
          : STATIONARY_FIRESTORE_HEARTBEAT_MS;

        if (elapsedMs < minIntervalMs) {
          return;
        }
      }

      lastSyncedCoordsRef.current = {
        latitude: coords.latitude,
        longitude: coords.longitude,
        accuracy: coords.accuracy,
        timestamp: now,
      };
      pendingOfflineCoordsRef.current = null;

      // Single document per user (`doc(db, 'locations', currentProfile.uid)`) — never creates duplicates
      const payload: UserLocation = {
        uid: currentProfile.uid,
        displayName: currentProfile.displayName,
        username: currentProfile.username,
        avatarColor: currentProfile.avatarColor,
        latitude: coords.latitude,
        longitude: coords.longitude,
        accuracy: coords.accuracy,
        timestamp: coords.updatedAtMs,
        heading: coords.heading ?? null,
        speed: coords.speed ?? null,
        sharingEnabled: true,
        allowedFriendUids: currentProfile.friends || [],
        updatedAt: new Date(coords.updatedAtMs).toISOString(),
        updatedAtMs: coords.updatedAtMs,
      };

      try {
        await setDoc(doc(db, 'locations', currentProfile.uid), payload);
      } catch (err) {
        // Keep last known coordinates so they can sync on next online cycle without crashing
        pendingOfflineCoordsRef.current = coords;
        console.warn('Temporary error syncing GPS location:', err);
      }
    },
    []
  );

  // Network Resilience: Monitor Internet connectivity & automatically sync cached location upon reconnection
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      isOnlineRef.current = true;
      setGpsError((prev) =>
        prev && prev.toLowerCase().includes('internet') ? null : prev
      );

      const currentProfile = profileRef.current;
      const latestCoords =
        pendingOfflineCoordsRef.current || myCoordsRef.current;
      if (currentProfile && currentProfile.sharingEnabled && latestCoords) {
        syncMyLocationToFirestore(
          { ...latestCoords, updatedAtMs: Date.now() },
          currentProfile,
          true
        );
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      isOnlineRef.current = false;
      setGpsError(
        'Internet unavailable. Keeping your last known location locally until connection returns.'
      );
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [syncMyLocationToFirestore]);

  // Whenever accepted friends list or profile appearance changes while sharing is ON, immediately update `/locations/{uid}`
  useEffect(() => {
    if (profile && profile.sharingEnabled && myCoords && isOnline) {
      syncMyLocationToFirestore(myCoords, profile, true);
    }
  }, [
    friendsKey,
    profile?.sharingEnabled,
    profile?.displayName,
    profile?.username,
    profile?.avatarColor,
    isOnline,
    syncMyLocationToFirestore,
  ]);

  // 6. Check Browser / Device Geolocation Permission state (without repeatedly prompting)
  useEffect(() => {
    if (!profile) return;
    if (!('geolocation' in navigator)) {
      setPermissionStatus('unsupported');
      setGpsError('GPS is not supported by this device or browser.');
      return;
    }

    if ('permissions' in navigator && navigator.permissions?.query) {
      navigator.permissions
        .query({ name: 'geolocation' })
        .then((result) => {
          setPermissionStatus(result.state as PermissionStatusType);
          if (
            result.state === 'prompt' &&
            profile.sharingEnabled &&
            !hasAutoPromptedPermissionRef.current
          ) {
            hasAutoPromptedPermissionRef.current = true;
            setShowPermissionModal(true);
          } else if (result.state === 'denied') {
            stopAllGpsTracking();
            setGpsError(
              'Location permission denied. Please allow Location access in your browser/device settings.'
            );
          }
          result.onchange = () => {
            setPermissionStatus(result.state as PermissionStatusType);
            if (result.state === 'granted') {
              setGpsError(null);
              setShowPermissionModal(false);
            } else if (result.state === 'denied') {
              stopAllGpsTracking();
              setMyCoords(null);
              setGpsError(
                'Location permission denied. Location sharing cannot update until permission is granted.'
              );
            }
          };
        })
        .catch(() => {
          // Fallback if Permissions API isn't supported
        });
    } else if (
      profile.sharingEnabled &&
      !hasAutoPromptedPermissionRef.current
    ) {
      hasAutoPromptedPermissionRef.current = true;
      setShowPermissionModal(true);
    }
  }, [profile?.uid, profile?.sharingEnabled, stopAllGpsTracking]);

  // Central GPS Position & Error Handlers
  const handleGpsPosition = useCallback(
    (pos: GeolocationPosition, forceFirestoreSync = false) => {
      setPermissionStatus('granted');
      setShowPermissionModal(false);

      const accuracyMeters = pos.coords.accuracy || 15;
      const nowMs = Date.now();

      // Track whether user is stationary or moving to adapt GPS accuracy & polling frequency
      const prevLocal = myCoordsRef.current;
      if (prevLocal) {
        const distFromPrev = calculateDistanceMeters(
          prevLocal.latitude,
          prevLocal.longitude,
          pos.coords.latitude,
          pos.coords.longitude
        );
        const speedMs = pos.coords.speed ?? 0;
        if (
          distFromPrev < STATIONARY_DISTANCE_THRESHOLD_METERS &&
          speedMs < 0.8
        ) {
          stationaryCountRef.current = Math.min(
            stationaryCountRef.current + 1,
            10
          );
        } else {
          stationaryCountRef.current = 0;
        }
      } else {
        stationaryCountRef.current = 0;
      }

      if (!navigator.onLine) {
        setGpsError(
          'Internet unavailable. Keeping your last known location locally until connection returns.'
        );
      } else if (accuracyMeters > LOW_ACCURACY_THRESHOLD_METERS) {
        setGpsError(
          `Low GPS accuracy (±${Math.round(
            accuracyMeters
          )}m). Move outdoors or enable High Accuracy Location in device settings.`
        );
      } else if (
        typeof document !== 'undefined' &&
        document.visibilityState === 'hidden' &&
        bgPermRef.current === 'denied'
      ) {
        setGpsError(
          'Foreground-only mode active: live updates pause while LinkUp tab is hidden.'
        );
      } else {
        setGpsError(null);
      }

      const fresh: LocalCoords = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: accuracyMeters,
        heading: pos.coords.heading,
        speed: pos.coords.speed,
        updatedAtMs: nowMs,
      };

      const currentProfile = profileRef.current;
      if (currentProfile && currentProfile.sharingEnabled) {
        setMyCoords(fresh);
        syncMyLocationToFirestore(fresh, currentProfile, forceFirestoreSync);
      } else {
        setMyCoords(null);
      }
    },
    [syncMyLocationToFirestore]
  );

  const handleGpsError = useCallback(
    (err: GeolocationPositionError, openModalOnDeny = false) => {
      if (!navigator.onLine) {
        setGpsError(
          'Internet unavailable. Keeping your last known location locally until connection returns.'
        );
        return;
      }

      if (err.code === err.PERMISSION_DENIED) {
        setPermissionStatus('denied');
        stopAllGpsTracking();
        setMyCoords(null);
        setGpsError(
          'Location permission denied. Please allow Location access in your browser/device settings to share your live location.'
        );
        if (openModalOnDeny) {
          setShowPermissionModal(true);
        }
      } else if (err.code === err.POSITION_UNAVAILABLE) {
        setGpsError(
          'GPS is unavailable or disabled. Please turn ON Location / GPS in your device settings.'
        );
      } else if (err.code === err.TIMEOUT) {
        setGpsError(
          'Location request timed out. Keeping last known position and retrying with battery-saving accuracy...'
        );
      } else {
        setGpsError(err.message || 'Unable to retrieve your real GPS location.');
      }
    },
    [stopAllGpsTracking]
  );

  // Request one-shot GPS fix & configure Foreground/Background permission choice
  const requestAndStartGps = useCallback(
    (enableBackground?: boolean) => {
      if (typeof enableBackground === 'boolean') {
        setShowPermissionModal(false);
        const nextBgState: BackgroundPermissionStatusType = enableBackground
          ? 'granted'
          : 'denied';
        setBackgroundPermissionStatus(nextBgState);
        bgPermRef.current = nextBgState;
        try {
          localStorage.setItem(BG_PERMISSION_STORAGE_KEY, nextBgState);
        } catch {
          // ignore storage errors
        }
        if (!enableBackground) {
          setGpsError(
            'Foreground tab only mode enabled. Live updates will pause when you switch away from LinkUp.'
          );
        }
      }

      if (!('geolocation' in navigator)) {
        setPermissionStatus('unsupported');
        setGpsError('GPS is not supported on this device.');
        return;
      }

      if (!navigator.onLine) {
        setGpsError(
          'Internet unavailable. Keeping your last known location locally until connection returns.'
        );
      } else if (enableBackground !== false) {
        setGpsError(null);
      }

      stationaryCountRef.current = 0;

      navigator.geolocation.getCurrentPosition(
        (pos) => handleGpsPosition(pos, true),
        (err) => {
          if (
            err.code === err.TIMEOUT ||
            err.code === err.POSITION_UNAVAILABLE
          ) {
            // Fallback to balanced/network accuracy if high-accuracy satellite lock times out
            navigator.geolocation.getCurrentPosition(
              (pos) => handleGpsPosition(pos, true),
              (finalErr) => handleGpsError(finalErr, false),
              {
                enableHighAccuracy: false,
                timeout: 15000,
                maximumAge: 30000,
              }
            );
          } else {
            handleGpsError(err, false);
          }
        },
        {
          enableHighAccuracy: true,
          timeout: 12000,
          maximumAge: 10000,
        }
      );
    },
    [handleGpsPosition, handleGpsError]
  );

  // 7. Battery-Smart Live-Location Sharing System
  // Runs ONLY when `profile.sharingEnabled === true`; stops immediately when OFF
  useEffect(() => {
    if (!profile || !profile.sharingEnabled) {
      stopAllGpsTracking();
      setMyCoords(null);
      return;
    }

    if (!('geolocation' in navigator)) {
      setPermissionStatus('unsupported');
      setGpsError('GPS is not supported on this device.');
      return;
    }

    // Do not repeatedly ask for permission if already denied
    if (permissionStatus === 'denied') {
      stopAllGpsTracking();
      return;
    }

    let isCancelled = false;

    // Request Screen Wake Lock while open so the device stays awake during live sharing if supported
    const acquireWakeLockIfAllowed = async () => {
      try {
        if (
          'wakeLock' in navigator &&
          (navigator as any).wakeLock?.request &&
          document.visibilityState === 'visible' &&
          profileRef.current?.sharingEnabled
        ) {
          wakeLockRef.current = await (navigator as any).wakeLock.request(
            'screen'
          );
        }
      } catch {
        // Respect OS battery/wake-lock restrictions silently
      }
    };

    acquireWakeLockIfAllowed();

    // 1. Initial location fix when Location Sharing is ON
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!isCancelled) handleGpsPosition(pos, true);
      },
      (err) => {
        if (!isCancelled) {
          if (
            err.code === err.TIMEOUT ||
            err.code === err.POSITION_UNAVAILABLE
          ) {
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                if (!isCancelled) handleGpsPosition(pos, true);
              },
              (fallbackErr) => {
                if (!isCancelled) handleGpsError(fallbackErr, false);
              },
              { enableHighAccuracy: false, timeout: 15000, maximumAge: 30000 }
            );
          } else {
            handleGpsError(err, false);
          }
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 10000,
      }
    );

    // 2. Low-power passive movement detector (`enableHighAccuracy: false`, `maximumAge: 25000`)
    // Avoids locking the GPS hardware at highest accuracy continuously while still noticing movement
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (isCancelled || !profileRef.current?.sharingEnabled) return;
        if (
          document.visibilityState === 'hidden' &&
          bgPermRef.current === 'denied'
        ) {
          return;
        }
        handleGpsPosition(pos, false);
      },
      (err) => {
        if (isCancelled) return;
        if (err.code === err.PERMISSION_DENIED) {
          handleGpsError(err, false);
        }
      },
      {
        enableHighAccuracy: false,
        maximumAge: 25000,
        timeout: 30000,
      }
    );
    watchIdRef.current = watchId;

    // 3. Adaptive polling loop:
    // - Uses High Accuracy (`enableHighAccuracy: true`) every 15–25s ONLY when moving or initializing
    // - Switches to Battery-Saver Accuracy (`enableHighAccuracy: false`) every 60s when stationary
    const scheduleNextAdaptivePoll = () => {
      if (isCancelled || !profileRef.current?.sharingEnabled) return;

      const isStationary = stationaryCountRef.current >= 2;
      const latest = myCoordsRef.current;
      const isMovingFast =
        !isStationary &&
        latest?.speed !== null &&
        latest?.speed !== undefined &&
        latest.speed > 1.2;

      const nextDelayMs = isStationary
        ? STATIONARY_POLL_INTERVAL_MS // 60s when stationary
        : isMovingFast
        ? MOVING_UPDATE_INTERVAL_MS // 15s when moving fast
        : MODERATE_MOVING_UPDATE_INTERVAL_MS; // 25s standard moving interval

      adaptiveTimerRef.current = setTimeout(() => {
        if (isCancelled || !profileRef.current?.sharingEnabled) return;

        // Respect Foreground-only mode if tab is hidden
        if (
          document.visibilityState === 'hidden' &&
          bgPermRef.current === 'denied'
        ) {
          scheduleNextAdaptivePoll();
          return;
        }

        // Only request High Accuracy when actively moving (or if current accuracy is poor > 100m)
        const needHighAccuracy =
          stationaryCountRef.current < 2 ||
          !myCoordsRef.current ||
          myCoordsRef.current.accuracy > 100;

        navigator.geolocation.getCurrentPosition(
          (pos) => {
            if (!isCancelled) {
              handleGpsPosition(pos, false);
            }
            scheduleNextAdaptivePoll();
          },
          (err) => {
            if (!isCancelled && err.code === err.PERMISSION_DENIED) {
              handleGpsError(err, false);
              return;
            }
            scheduleNextAdaptivePoll();
          },
          {
            enableHighAccuracy: needHighAccuracy,
            maximumAge: needHighAccuracy ? 15000 : 45000,
            timeout: 20000,
          }
        );
      }, nextDelayMs);
    };

    scheduleNextAdaptivePoll();

    // 4. Web/PWA visibility handling: smoothly sync on tab hide/resume
    const handleVisibilityChange = () => {
      if (!profileRef.current?.sharingEnabled) return;

      if (document.visibilityState === 'hidden') {
        if (bgPermRef.current === 'denied') {
          setGpsError(
            'Foreground-only mode active: live updates pause while LinkUp tab is hidden.'
          );
        }
      } else if (document.visibilityState === 'visible') {
        stationaryCountRef.current = 0;
        acquireWakeLockIfAllowed();
        // Immediately refresh and sync location when user returns to LinkUp
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            if (!isCancelled) handleGpsPosition(pos, true);
          },
          (err) => {
            if (!isCancelled && err.code === err.PERMISSION_DENIED) {
              handleGpsError(err, false);
            }
          },
          { enableHighAccuracy: true, maximumAge: 10000, timeout: 12000 }
        );
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isCancelled = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      stopAllGpsTracking();
    };
  }, [
    profile?.uid,
    profile?.sharingEnabled,
    permissionStatus,
    handleGpsPosition,
    handleGpsError,
    stopAllGpsTracking,
  ]);

  // 8. Toggle Location Sharing ON / OFF
  const handleToggleSharing = async () => {
    if (!profile) return;
    const nextState = !profile.sharingEnabled;
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();

    try {
      if (!nextState) {
        // Immediately stop all GPS requests, clear local map marker, and clear cached coords
        stopAllGpsTracking();
        setMyCoords(null);
        lastSyncedCoordsRef.current = null;
        pendingOfflineCoordsRef.current = null;
        setGpsError(null);
      }

      await updateDoc(doc(db, 'users', profile.uid), {
        sharingEnabled: nextState,
        updatedAt: nowIso,
      });

      if (!nextState) {
        // Immediately delete live location document from Firestore so friends stop seeing it
        await deleteDoc(doc(db, 'locations', profile.uid)).catch(() => {});
      } else {
        // Turning Location Sharing ON: get fresh GPS fix and publish immediately
        requestAndStartGps();
      }
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.UPDATE,
        `users/${profile.uid}`
      );
    }
  };

  // 9. Friend Request Actions (Send, Accept, Reject, Cancel, Remove Friend)
  const handleSendFriendRequest = async (targetUser: UserProfile) => {
    if (!profile) return;
    const reqId = `${profile.uid}_${targetUser.uid}`;
    const now = new Date().toISOString();

    try {
      await setDoc(doc(db, 'friendRequests', reqId), {
        fromUid: profile.uid,
        fromName: profile.displayName,
        fromUsername: profile.username,
        fromAvatarColor: profile.avatarColor,
        toUid: targetUser.uid,
        toName: targetUser.displayName,
        toUsername: targetUser.username,
        toAvatarColor: targetUser.avatarColor,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      });
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.CREATE,
        `friendRequests/${reqId}`
      );
    }
  };

  const handleAcceptRequest = async (req: FriendRequest) => {
    if (!profile) return;
    const now = new Date().toISOString();

    try {
      // 1. Mark request accepted
      await updateDoc(doc(db, 'friendRequests', req.id), {
        status: 'accepted',
        updatedAt: now,
      });

      // 2. Add each user to the other's accepted friends list
      await updateDoc(doc(db, 'users', profile.uid), {
        friends: arrayUnion(req.fromUid),
        updatedAt: now,
      });

      await updateDoc(doc(db, 'users', req.fromUid), {
        friends: arrayUnion(profile.uid),
        updatedAt: now,
      });
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.UPDATE,
        `friendRequests/${req.id}`
      );
    }
  };

  const handleRejectRequest = async (req: FriendRequest) => {
    try {
      await deleteDoc(doc(db, 'friendRequests', req.id));
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.DELETE,
        `friendRequests/${req.id}`
      );
    }
  };

  const handleCancelRequest = async (req: FriendRequest) => {
    try {
      await deleteDoc(doc(db, 'friendRequests', req.id));
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.DELETE,
        `friendRequests/${req.id}`
      );
    }
  };

  const handleRemoveFriend = async (friendUid: string) => {
    if (!profile) return;
    const now = new Date().toISOString();

    try {
      await updateDoc(doc(db, 'users', profile.uid), {
        friends: arrayRemove(friendUid),
        updatedAt: now,
      });
      await updateDoc(doc(db, 'users', friendUid), {
        friends: arrayRemove(profile.uid),
        updatedAt: now,
      });

      // Clean up any friendRequests docs between the two users
      const id1 = `${profile.uid}_${friendUid}`;
      const id2 = `${friendUid}_${profile.uid}`;
      await deleteDoc(doc(db, 'friendRequests', id1)).catch(() => {});
      await deleteDoc(doc(db, 'friendRequests', id2)).catch(() => {});
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.UPDATE,
        `users/${profile.uid}`
      );
    }
  };

  // 10. Update Name & Profile in Settings
  const handleUpdateProfile = async (
    newName: string,
    newUsername: string,
    newColor: string
  ) => {
    if (!profile) return;
    const cleanUser = sanitizeUsername(newUsername);

    if (cleanUser !== profile.usernameLower) {
      const q = query(
        collection(db, 'users'),
        where('usernameLower', '==', cleanUser)
      );
      const snap = await getDocs(q);
      const taken = snap.docs.some((d) => d.id !== profile.uid);
      if (taken) {
        throw new Error(`Username @${cleanUser} is already taken.`);
      }
    }

    const now = new Date().toISOString();
    try {
      await updateDoc(doc(db, 'users', profile.uid), {
        name: newName,
        displayName: newName,
        username: cleanUser,
        usernameLower: cleanUser,
        avatarColor: newColor,
        updatedAt: now,
      });
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.UPDATE,
        `users/${profile.uid}`
      );
    }
  };

  // 11. Logout
  const handleLogout = async () => {
    stopAllGpsTracking();
    setMyCoords(null);
    lastSyncedCoordsRef.current = null;
    pendingOfflineCoordsRef.current = null;
    if (profile) {
      await deleteDoc(doc(db, 'locations', profile.uid)).catch(() => {});
    }
    setProfile(null);
    await firebaseSignOut(auth);
  };

  // Initial Boot Loading Splash (does not unmount AuthScreen during sign-in)
  if (!authReady || !initialProfileChecked) {
    return (
      <div className="min-h-dvh bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 gap-3">
        <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
          <MapPin className="w-6 h-6 animate-bounce" />
        </div>
        <div className="flex items-center gap-2 text-sm font-bold text-white">
          <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
          <span>Loading LinkUp...</span>
        </div>
        <span className="text-xs text-slate-500">Credit: Sakib</span>
      </div>
    );
  }

  // Auth or Profile Onboarding Screen
  if (!firebaseUser || !profile) {
    return (
      <AuthScreen
        firebaseUser={firebaseUser}
        onProfileCreated={(created) => {
          setProfile(created);
          setActiveTab('map');
          hasAutoPromptedPermissionRef.current = true;
          setShowPermissionModal(true);
        }}
      />
    );
  }

  const pendingIncomingCount = incomingRequests.filter(
    (r) => r.status === 'pending'
  ).length;

  return (
    <div className="h-dvh w-screen overflow-hidden flex flex-col bg-slate-950 text-slate-100 select-none">
      {/* Device Location Permission & Sharing Mode Sheet */}
      {showPermissionModal && (
        <PermissionSheet
          permissionStatus={permissionStatus}
          backgroundPermissionStatus={backgroundPermissionStatus}
          gpsError={gpsError}
          onRequestPermission={(enableBg) => requestAndStartGps(enableBg)}
          onDenyBackgroundPermission={() => {
            setBackgroundPermissionStatus('denied');
            bgPermRef.current = 'denied';
            try {
              localStorage.setItem(BG_PERMISSION_STORAGE_KEY, 'denied');
            } catch {
              // ignore
            }
          }}
          onDismiss={() => setShowPermissionModal(false)}
        />
      )}

      {/* Main Content Area */}
      <main className="flex-1 relative overflow-hidden">
        {activeTab === 'map' && (
          <MapView
            profile={profile}
            myCoords={myCoords}
            friendProfiles={friendProfiles}
            friendLocations={friendLocations}
            permissionStatus={permissionStatus}
            gpsError={gpsError}
            focusedFriendUid={focusedFriendUid}
            onClearFocusedFriend={() => setFocusedFriendUid(null)}
            onToggleSharing={handleToggleSharing}
            onRequestPermission={() => {
              setShowPermissionModal(true);
            }}
            onRefreshGps={() => {
              if (profile.sharingEnabled) {
                requestAndStartGps();
              } else {
                setGpsError(
                  'Location Sharing is currently OFF. Turn Sharing ON to publish and view your live GPS pin.'
                );
              }
            }}
            onOpenFriendsTab={() => setActiveTab('friends')}
          />
        )}

        {activeTab === 'friends' && (
          <FriendsTab
            profile={profile}
            myCoords={myCoords}
            friendProfiles={friendProfiles}
            friendLocations={friendLocations}
            incomingRequests={incomingRequests}
            outgoingRequests={outgoingRequests}
            onSendFriendRequest={handleSendFriendRequest}
            onAcceptRequest={handleAcceptRequest}
            onRemoveFriend={handleRemoveFriend}
            onFocusFriendOnMap={(fUid) => {
              setFocusedFriendUid(fUid);
              setActiveTab('map');
            }}
          />
        )}

        {activeTab === 'requests' && (
          <RequestsTab
            incomingRequests={incomingRequests}
            outgoingRequests={outgoingRequests}
            onAcceptRequest={handleAcceptRequest}
            onRejectRequest={handleRejectRequest}
            onCancelRequest={handleCancelRequest}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsTab
            profile={profile}
            myCoords={myCoords}
            permissionStatus={permissionStatus}
            backgroundPermissionStatus={backgroundPermissionStatus}
            onUpdateProfile={handleUpdateProfile}
            onToggleSharing={handleToggleSharing}
            onRequestPermission={() => {
              setShowPermissionModal(true);
            }}
            onLogout={handleLogout}
          />
        )}
      </main>

      {/* Modern Android Material 3 Bottom Navigation Bar */}
      <nav className="h-16 bg-slate-900/95 backdrop-blur-xl border-t border-slate-800/90 px-2 flex items-center justify-around shrink-0 z-[500]">
        <button
          type="button"
          onClick={() => setActiveTab('map')}
          className="flex flex-col items-center justify-center gap-1 w-20 py-1 cursor-pointer group"
        >
          <div
            className={`px-4 py-1 rounded-full transition-colors ${
              activeTab === 'map'
                ? 'bg-emerald-500/20 text-emerald-400'
                : 'text-slate-400 group-hover:text-slate-200'
            }`}
          >
            <Map className="w-5 h-5" />
          </div>
          <span
            className={`text-[11px] font-bold ${
              activeTab === 'map' ? 'text-emerald-400' : 'text-slate-400'
            }`}
          >
            Home / Map
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('friends')}
          className="flex flex-col items-center justify-center gap-1 w-20 py-1 cursor-pointer group"
        >
          <div
            className={`px-4 py-1 rounded-full transition-colors ${
              activeTab === 'friends'
                ? 'bg-emerald-500/20 text-emerald-400'
                : 'text-slate-400 group-hover:text-slate-200'
            }`}
          >
            <Users className="w-5 h-5" />
          </div>
          <span
            className={`text-[11px] font-bold ${
              activeTab === 'friends' ? 'text-emerald-400' : 'text-slate-400'
            }`}
          >
            Friends
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('requests')}
          className="relative flex flex-col items-center justify-center gap-1 w-24 py-1 cursor-pointer group"
        >
          <div
            className={`relative px-4 py-1 rounded-full transition-colors ${
              activeTab === 'requests'
                ? 'bg-emerald-500/20 text-emerald-400'
                : 'text-slate-400 group-hover:text-slate-200'
            }`}
          >
            <Bell className="w-5 h-5" />
            {pendingIncomingCount > 0 && (
              <span className="absolute -top-0.5 right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-extrabold flex items-center justify-center shadow">
                {pendingIncomingCount}
              </span>
            )}
          </div>
          <span
            className={`text-[11px] font-bold ${
              activeTab === 'requests' ? 'text-emerald-400' : 'text-slate-400'
            }`}
          >
            Requests
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('settings')}
          className="flex flex-col items-center justify-center gap-1 w-20 py-1 cursor-pointer group"
        >
          <div
            className={`px-4 py-1 rounded-full transition-colors ${
              activeTab === 'settings'
                ? 'bg-emerald-500/20 text-emerald-400'
                : 'text-slate-400 group-hover:text-slate-200'
            }`}
          >
            <Settings className="w-5 h-5" />
          </div>
          <span
            className={`text-[11px] font-bold ${
              activeTab === 'settings' ? 'text-emerald-400' : 'text-slate-400'
            }`}
          >
            Settings
          </span>
        </button>
      </nav>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}
