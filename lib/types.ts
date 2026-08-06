export type Role = "member" | "admin";

export interface UserDoc {
  nickname: string;
  email?: string;
  photoUrl?: string;
  role: Role;
  provider?: string;
  createdAt?: unknown;
}

export interface SessionDoc {
  title: string;
  day: string;
  time: string;
  location: string;
  capacity: number;
  count: number;
  /** Total cost of the session, shared between the players who played. */
  cost?: number | null;
  /** Optional override of how many players actually played (defaults to count). */
  playersOverride?: number | null;
  createdAt?: unknown;
}

export interface Registration {
  uid: string;
  nickname: string;
  photoUrl?: string;
  createdAt?: unknown;
}

export interface Rating {
  ratedUid: string;
  raterUid: string;
  stars: number;
  createdAt?: unknown;
}

export interface LeaderboardEntry {
  uid: string;
  nickname: string;
  photoUrl?: string;
  avg: number;
  count: number;
  myStars: number | null;
}
