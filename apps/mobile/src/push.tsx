import { useMutation, useQuery } from "@tanstack/react-query";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { router } from "expo-router";
import { useEffect } from "react";
import { Platform } from "react-native";
import { useSession } from "./session";
import { useTRPC } from "./trpc";

/**
 * Push needs a development or store build: Expo Go doesn't have the native module (importing it
 * there crashes the app), and the web build has no push. So it's only loaded where it can work.
 */
const canPush = Platform.OS !== "web" && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;
const loadNotifications = () => import("expo-notifications");

/**
 * Signed in on a phone: ask to send notifications and register this phone's push token with the
 * API (it also needs an EAS project id). Tapping a notification opens the screen it's about.
 */
export function PushRegistration() {
  const trpc = useTRPC();
  const { session } = useSession();
  const me = useQuery({ ...trpc.me.get.queryOptions(), enabled: !!session && canPush });
  const save = useMutation(trpc.me.update.mutationOptions());
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  const known = me.data?.expoPushToken;

  useEffect(() => {
    if (!canPush || !session || !me.data || !projectId) return;
    let cancelled = false;
    (async () => {
      try {
        const Notifications = await loadNotifications();
        const { status } = await Notifications.requestPermissionsAsync();
        if (status !== "granted" || cancelled) return;
        const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
        if (!cancelled && token !== known) save.mutate({ expoPushToken: token });
      } catch (err) {
        console.warn("Couldn't register for push notifications:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, me.data, projectId, known]);

  useEffect(() => {
    if (!canPush) return;
    let remove: (() => void) | undefined;
    loadNotifications()
      .then((Notifications) => {
        // Show notifications that arrive while the app is open, too.
        Notifications.setNotificationHandler({
          handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
        });
        const sub = Notifications.addNotificationResponseReceivedListener((response) => {
          const path = response.notification.request.content.data?.path;
          if (typeof path === "string" && path.startsWith("/")) router.push(path as never);
        });
        remove = () => sub.remove();
      })
      .catch((err) => console.warn("Notifications unavailable:", err));
    return () => remove?.();
  }, []);

  return null;
}
