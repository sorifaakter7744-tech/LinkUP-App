export type NavigationTab = 'map' | 'friends' | 'requests' | 'settings';

export type PermissionStatusType = 'prompt' | 'granted' | 'denied' | 'unsupported';

export type BackgroundPermissionStatusType =
  | 'prompt'
  | 'granted'
  | 'denied'
  | 'restricted';

export interface UserProfile {
  uid: string;
  name?: string;
  displayName: string;
  username: string;
  usernameLower: string;
  email: string;
  photoURL?: string;
  avatarColor: string;
  sharingEnabled: boolean;
  friends: string[];
  createdAt: string;
  updatedAt: string;
}

export interface UserLocation {
  uid: string;
  displayName: string;
  username: string;
  avatarColor: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
  heading?: number | null;
  speed?: number | null;
  sharingEnabled: boolean;
  allowedFriendUids: string[];
  updatedAt: string;
  updatedAtMs: number;
}

export interface FriendRequest {
  id: string;
  fromUid: string;
  fromName: string;
  fromUsername: string;
  fromAvatarColor: string;
  toUid: string;
  toName: string;
  toUsername: string;
  toAvatarColor: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: string;
  updatedAt: string;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  };
}

export const AVATAR_COLORS = [
  '#10B981', // Emerald
  '#3B82F6', // Blue
  '#8B5CF6', // Violet
  '#F59E0B', // Amber
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#F97316', // Orange
  '#14B8A6', // Teal
];
