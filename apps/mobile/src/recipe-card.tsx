import { BREW_METHOD_LABELS, brewRatio, radius } from "@propperbrew/shared";
import { Link } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { fonts, themed } from "./theme";
import type { RouterOutputs } from "./trpc";
import { Chip, Eyebrow, Headline, Step } from "./ui";
import { UpvoteButton } from "./upvote";

type Recipe = RouterOutputs["recipes"]["forBean"][number];

export const authorName = (author: Recipe["author"]) => (author.type === "roaster" ? author.name : author.username);

/** A recipe in a coffee's brewing guide; tapping it opens the full recipe. */
export function RecipeCard({ recipe: r }: { recipe: Recipe }) {
  const styles = useStyles();
  const title = BREW_METHOD_LABELS[r.brewMethod];
  const byRoaster = r.author.type === "roaster";

  return (
    <Link href={{ pathname: "/recipe/[id]", params: { id: r.id } }} asChild>
      <Pressable style={styles.card} aria-label={`${title} recipe by ${authorName(r.author)}`}>
        <View style={styles.head}>
          <View style={{ flex: 1, gap: 6, alignItems: "flex-start" }}>
            {byRoaster && <Chip small label="Roaster's pick" />}
            <Headline>{title}</Headline>
            <Eyebrow>By {authorName(r.author)}</Eyebrow>
          </View>
          <UpvoteButton recipe={r} />
        </View>
        <Step icon="scale" title="Ratio">
          {r.coffeeDoseG}g → {r.waterWeightG}g ({brewRatio(r.coffeeDoseG, r.waterWeightG)})
        </Step>
        {r.waterTempC ? (
          <Step icon="thermostat" title="Temperature">
            {r.waterTempC}°C
          </Step>
        ) : null}
        {r.grinderModel || r.grindSetting ? (
          <Step icon="grain" title="Grind">
            {[r.grinderModel, r.grindSetting].filter(Boolean).join(" @ ")}
          </Step>
        ) : null}
        <Eyebrow style={styles.link}>View full recipe →</Eyebrow>
      </Pressable>
    </Link>
  );
}

const useStyles = themed((c) =>
  StyleSheet.create({
    card: { gap: 20, padding: 24, borderRadius: radius.xl, backgroundColor: c.surfaceContainerLow },
    head: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
    link: { color: c.primary, fontFamily: fonts.labelBold },
  }),
);
