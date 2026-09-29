import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut as firebaseSignOut,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import {
  AVATAR_COLORS,
  FirestoreErrorInfo,
  OperationType,
  UserProfile,
} from './types';
import { sanitizeUsername } from './utils/geo';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export {
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  firebaseSignOut,
};

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData.map((provider) => ({
          providerId: provider.providerId,
          displayName: provider.displayName,
          email: provider.email,
          photoUrl: provider.photoURL,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export function formatAuthOrFirestoreError(err: any): string {
  if (!err) return 'Authentication failed. Please try again.';

  const code = err?.code || '';
  if (code === 'auth/popup-closed-by-user') {
    return 'Google Sign-In window was closed before completing login. Please tap "Continue with Google" or "Create Account" and select your Google account.';
  }
  if (code === 'auth/popup-blocked') {
    return 'Your browser blocked the Google Sign-In popup. Please allow popups for this site and try again.';
  }
  if (code === 'auth/cancelled-popup-request') {
    return 'A Google Sign-In popup is already open. Please complete or close that window and try again.';
  }
  if (code === 'auth/unauthorized-domain') {
    return `This domain (${window.location.hostname}) is not authorized in Firebase Authentication. Add it in Firebase Console > Authentication > Settings > Authorized domains.`;
  }
  if (code === 'auth/network-request-failed') {
    return 'Network error while connecting to Firebase Authentication. Please check your internet connection and try again.';
  }

  const rawMessage = err instanceof Error ? err.message : String(err);
  try {
    const parsed = JSON.parse(rawMessage);
    if (parsed && typeof parsed.error === 'string') {
      return `Database error (${parsed.operationType}): ${parsed.error}`;
    }
  } catch {
    // Not a JSON-encoded FirestoreErrorInfo
  }

  return rawMessage || 'Authentication failed. Please try again.';
}

async function resolveUniqueUsername(
  baseCandidate: string,
  currentUid: string
): Promise<string> {
  let clean = sanitizeUsername(baseCandidate);
  if (clean.length < 2) {
    clean = `user_${currentUid.slice(0, 6).toLowerCase()}`;
  }

  try {
    const q = query(
      collection(db, 'users'),
      where('usernameLower', '==', clean.toLowerCase())
    );
    const snap = await getDocs(q);
    const takenByOther = snap.docs.some((d) => d.id !== currentUid);
    if (!takenByOther) {
      return clean;
    }
  } catch (err) {
    console.warn('Username check warning, using UID suffix fallback:', err);
  }

  const suffix = sanitizeUsername(currentUid.slice(0, 4).toLowerCase()) || '99';
  return sanitizeUsername(`${clean.slice(0, 22)}_${suffix}`);
}

export interface ProfileSyncOptions {
  preferredName?: string;
  preferredUsername?: string;
  preferredColor?: string;
}

/**
 * Creates or updates the authenticated user's profile in Firestore `/users/{uid}`.
 * Saves the user's name, email, profile photo, user ID, location sharing status,
 * and account creation time.
 */
export async function createOrUpdateUserProfile(
  user: FirebaseUser,
  options: ProfileSyncOptions = {}
): Promise<UserProfile> {
  const userRef = doc(db, 'users', user.uid);
  let existingData: Partial<UserProfile> | null = null;

  try {
    const existingSnap = await getDoc(userRef);
    if (existingSnap.exists()) {
      existingData = existingSnap.data() as Partial<UserProfile>;
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `users/${user.uid}`);
  }

  const nowIso = new Date().toISOString();
  const googleCreationTime = user.metadata?.creationTime
    ? new Date(user.metadata.creationTime).toISOString()
    : nowIso;

  const trimmedPreferredName = options.preferredName?.trim() || '';
  const resolvedName = (
    trimmedPreferredName ||
    existingData?.displayName ||
    existingData?.name ||
    user.displayName?.trim() ||
    user.email?.split('@')[0] ||
    'Friend'
  ).slice(0, 60);

  let resolvedUsername = '';
  const trimmedPreferredUsername = sanitizeUsername(
    options.preferredUsername || ''
  );

  if (trimmedPreferredUsername.length >= 2) {
    resolvedUsername = await resolveUniqueUsername(
      trimmedPreferredUsername,
      user.uid
    );
  } else if (existingData?.username && existingData.username.length >= 2) {
    resolvedUsername = existingData.username;
  } else {
    const baseFromUser =
      user.email?.split('@')[0] || resolvedName || `user_${user.uid.slice(0, 5)}`;
    resolvedUsername = await resolveUniqueUsername(baseFromUser, user.uid);
  }

  const resolvedColor =
    options.preferredColor ||
    existingData?.avatarColor ||
    AVATAR_COLORS[0];

  const resolvedSharing =
    typeof existingData?.sharingEnabled === 'boolean'
      ? existingData.sharingEnabled
      : true;

  const resolvedFriends = Array.isArray(existingData?.friends)
    ? existingData.friends
    : [];

  const resolvedCreatedAt =
    existingData?.createdAt || googleCreationTime || nowIso;

  const profileData: UserProfile = {
    uid: user.uid,
    name: resolvedName,
    displayName: resolvedName,
    username: resolvedUsername,
    usernameLower: resolvedUsername.toLowerCase(),
    email: user.email || existingData?.email || '',
    photoURL: user.photoURL || existingData?.photoURL || '',
    avatarColor: resolvedColor,
    sharingEnabled: resolvedSharing,
    friends: resolvedFriends,
    createdAt: resolvedCreatedAt,
    updatedAt: nowIso,
  };

  try {
    await setDoc(userRef, profileData, { merge: true });
    return profileData;
  } catch (err) {
    handleFirestoreError(
      err,
      existingData ? OperationType.UPDATE : OperationType.CREATE,
      `users/${user.uid}`
    );
  }
}

export async function testFirestoreConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, '_connection_check', 'ping'));
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('the client is offline')
    ) {
      console.error(
        'Please check your Firebase configuration. Client is offline.'
      );
    }
  }
}
