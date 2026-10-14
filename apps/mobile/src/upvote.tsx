import { MaterialIcons } from "@expo/vector-icons";
import { radius } from "@propperbrew/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { useSession } from "./session";
import { fonts, themed, useColors } from "./theme";
import { useTRPC } from "./trpc";

/**
 * "Tried it? Upvote it." Updates immediately, then settles on the server's count.
 * Signed-out people are sent to sign in first.
 */
export function UpvoteButton({ recipe }: { recipe: { id: string; upvotesCount: number; upvotedByMe: boolean } }) {
  const styles = useStyles();
  const colors = useColors();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { session } = useSession();
  const [state, setState] = useState({ count: recipe.upvotesCount, mine: recipe.upvotedByMe });

  // Follow fresh server data (e.g. after signing in, or a refetch).
  useEffect(() => setState({ count: recipe.upvotesCount, mine: recipe.upvotedByMe }), [recipe.upvotesCount, recipe.upvotedByMe]);

  const toggle = useMutation(
    trpc.recipes.toggleUpvote.mutationOptions({
      onSuccess: ({ upvoted, upvotesCount }) => setState({ count: upvotesCount, mine: upvoted }),
      onError: () => setState({ count: recipe.upvotesCount, mine: recipe.upvotedByMe }),
      // Lists are ordered by upvotes, and the recipe screen shows the count too.
      onSettled: () => queryClient.invalidateQueries({ queryKey: trpc.recipes.pathKey() }),
    }),
  );

  const press = () => {
    if (!session) return router.push("/sign-in");
    setState((s) => ({ count: s.count + (s.mine ? -1 : 1), mine: !s.mine }));
    toggle.mutate({ recipeId: recipe.id });
  };

  return (
    <Pressable
      role="button"
      aria-pressed={state.mine}
      aria-label={`${state.mine ? "Remove upvote" : "Upvote"}, ${state.count} ${state.count === 1 ? "upvote" : "upvotes"}`}
      onPress={press}
      disabled={toggle.isPending}
      hitSlop={6}
      style={({ pressed }) => [styles.button, state.mine && styles.mine, pressed && { opacity: 0.8 }]}
    >
      <MaterialIcons name="arrow-upward" size={16} color={state.mine ? colors.onPrimary : colors.primary} />
      <Text style={[styles.count, state.mine && styles.mineText]}>{state.count}</Text>
    </Pressable>
  );
}

const useStyles = themed((c) =>
  StyleSheet.create({
    button: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: radius.md,
      backgroundColor: c.surfaceContainerHigh,
    },
    mine: { backgroundColor: c.surfaceTint },
    count: { fontFamily: fonts.labelBold, fontSize: 13, color: c.primary, fontVariant: ["tabular-nums"] },
    mineText: { color: c.onPrimary },
  }),
);
