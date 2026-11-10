import { useQuery } from "@tanstack/react-query";
import { useSession } from "./session";
import { useTRPC } from "./trpc";

/** Whether checkout is on here, and how many bags are in the basket (for the tab's badge). */
export function useBasketSummary() {
  const trpc = useTRPC();
  const { session } = useSession();
  const enabled = useQuery(trpc.basket.enabled.queryOptions());
  const basket = useQuery({ ...trpc.basket.get.queryOptions(), enabled: !!session && enabled.data === true });
  return { enabled: enabled.data === true, count: session ? (basket.data?.count ?? 0) : 0 };
}
