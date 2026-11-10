import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

let signingOut = false;
let endedUnasked = false;

/**
 * AsyncStorage, noticing when the client drops the stored session without being asked to (it ran
 * out or was revoked), so the sign-in screen can say so. Done here rather than with an auth event,
 * because that can happen while the client starts up, before anything is listening.
 */
const storage = {
  getItem: (key: string) => AsyncStorage.getItem(key),
  setItem: (key: string, value: string) => {
    if (key.endsWith("-auth-token")) endedUnasked = false;
    return AsyncStorage.setItem(key, value);
  },
  removeItem: (key: string) => {
    if (key.endsWith("-auth-token") && !signingOut) endedUnasked = true;
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
  try {
    await supabase.auth.signOut();
  } finally {
    signingOut = false;
  }
}

/** Their session ended without them signing out. */
export const sessionEndedUnasked = () => endedUnasked;
