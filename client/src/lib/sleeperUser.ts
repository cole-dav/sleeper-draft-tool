export type SleeperUser = {
  userId: string;
  username: string;
  displayName?: string;
  avatar?: string;
};

const STORAGE_KEY = "sleeperUser";

export function getSleeperUser(): SleeperUser | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SleeperUser;
    if (!parsed?.userId || !parsed?.username) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setSleeperUser(user: SleeperUser) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
}

export function clearSleeperUser() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}
