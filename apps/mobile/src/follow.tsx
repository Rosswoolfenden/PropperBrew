import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useSession } from "./session";
import { useTRPC } from "./trpc";
import { Button } from "./ui";

/** Follow a roaster to hear about its new coffees. Signed out, it asks you to sign in. */
export function FollowButton({ roasterId, name }: { roasterId: string; name: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { session, ready } = useSession();
  const status = useQuery({ ...trpc.follows.status.queryOptions({ roasterId }), enabled: !!session });
  const toggle = useMutation(
    trpc.follows.toggle.mutationOptions({
      onSuccess: (data) => {
        queryClient.setQueryData(trpc.follows.status.queryKey({ roasterId }), data);
        queryClient.invalidateQueries({ queryKey: trpc.follows.mine.queryKey() });
      },
    }),
  );
  const following = status.data?.following ?? false;
  return (
    <Button
      label={following ? "Following" : `Follow ${name}`}
      icon={following ? "check" : "add"}
      variant={following ? "secondary" : "primary"}
      disabled={!ready || toggle.isPending || (!!session && status.isPending)}
      onPress={() => (session ? toggle.mutate({ roasterId }) : router.push("/sign-in"))}
    />
  );
}
