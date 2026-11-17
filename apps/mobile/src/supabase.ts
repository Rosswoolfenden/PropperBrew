import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

let signingOut = false;
/** Signed out on purpose, until they next sign in. */
let signedOutOnPurpose = false;
/** A session was stored on this device at some point (read at start-up, or saved since). */
let hadSession = false;
let droppedUnasked = false;

/**
 * AsyncStorage, noticing when a stored session goes away without them signing out (it ran out or
 * was revoked), so the sign-in screen can say so. Done here rather than with an auth event,
 * because that can happen while the client starts up, before anything is listening.
 */
const storage = {
  getItem: async (key: string) => {
    const value = await AsyncStorage.getItem(key);
    if (value && key.endsWith("-auth-token")) hadSession = true;
    return value;
  },
  setItem: (key: string, value: string) => {
    if (key.endsWith("-auth-token")) {
      hadSession = true;
      signedOutOnPurpose = false;
      droppedUnasked = false;
    }
    return AsyncStorage.setItem(key, value);
  },
  removeItem: (key: string) => {
    if (key.endsWith("-auth-token") && !signingOut) droppedUnasked = true;
    return AsyncStorage.removeItem(key);
  },
};

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321",
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "",
  {
    auth: { storage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
  },
);

/** Sign out because they asked to. */
export async function signOut() {
  signingOut = true;
  signedOutOnPurpose = true;
  try {
    await supabase.auth.signOut();
  } finally {
    signingOut = false;
  }
}

/**
 * Their session ended without them signing out. Asked only when there's no session now, so a
 * session that was once here (or was dropped) and isn't any more ran out.
 */
export const sessionEndedUnasked = () => !signedOutOnPurpose && (droppedUnasked || hadSession);
