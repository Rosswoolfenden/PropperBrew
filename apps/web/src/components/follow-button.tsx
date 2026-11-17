"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, useTRPC } from "@/app/providers";

/** Follow a roaster to hear about its new coffees (in the app's notifications and on the home page). */
export function FollowButton({ roasterId, name }: { roasterId: string; name: string }) {
  const { session, ready } = useSession();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const status = useQuery({ ...trpc.follows.status.queryOptions({ roasterId }), enabled: !!session });
  const toggle = useMutation(
    trpc.follows.toggle.mutationOptions({
      onSuccess: (data) => {
        queryClient.setQueryData(trpc.follows.status.queryKey({ roasterId }), data);
        queryClient.invalidateQueries({ queryKey: trpc.follows.mine.queryKey() });
      },
    }),
  );
  if (!ready) return null;
  if (!session) {
    return (
      <Link className="button button-secondary button-sm follow-button" href={`/sign-in?next=${encodeURIComponent(pathname)}`}>
        Follow {name}
      </Link>
    );
  }
  const following = status.data?.following ?? false;
  return (
    <button
      type="button"
      className={`button button-sm follow-button${following ? " button-secondary" : ""}`}
      aria-pressed={following}
      disabled={status.isPending || toggle.isPending}
      onClick={() => toggle.mutate({ roasterId })}
    >
      {following ? "Following" : `Follow ${name}`}
    </button>
  );
}
