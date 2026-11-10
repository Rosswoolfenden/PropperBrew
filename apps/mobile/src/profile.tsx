import { useQuery } from "@tanstack/react-query";
import { BREW_METHOD_LABELS, brewRatio, radius, sensoryLevel } from "@propperbrew/shared";
import { Link } from "expo-router";
import type { ReactNode } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { fonts, themed } from "./theme";
import { ReportButton } from "./report";
import { useTRPC, type RouterOutputs } from "./trpc";
import { Body, Button, Chip, Eyebrow, GUTTER, Headline, Loading, Stars } from "./ui";

type Profile = RouterOutputs["users"]["profile"];

const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
const monthFormat = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" });
const beanHref = (bean: Profile["reviews"][number]["bean"]) =>
  ({ pathname: "/bean/[roaster]/[bean]", params: { roaster: bean.roaster.slug, bean: bean.slug } }) as const;

/** Loads and shows a profile (Stitch "User Profile & Reviews"). `children` goes under the stats, e.g. Edit profile. */
export function ProfileScreen({ username, children }: { username: string; children?: ReactNode }) {
  const trpc = useTRPC();
  const profile = useQuery({ ...trpc.users.profile.queryOptions({ username }), retry: (n, err) => err.data?.code !== "NOT_FOUND" && n < 2 });
  const styles = useStyles();

  if (profile.isPending) return <Loading />;
  if (profile.error) {
    return (
      <View style={styles.message}>
        <Body muted>{profile.error.data?.code === "NOT_FOUND" ? "There's no one here by that name." : "We couldn't load this profile."}</Body>
        {profile.error.data?.code !== "NOT_FOUND" && <Button label="Try again" variant="secondary" onPress={() => profile.refetch()} />}
      </View>
    );
  }
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ProfileView profile={profile.data}>{children}</ProfileView>
    </ScrollView>
  );
}

function ProfileView({ profile: p, children }: { profile: Profile; children?: ReactNode }) {
  const styles = useStyles();
  const name = p.displayName ?? p.username;
  const gear = [p.gear.brewMethod && BREW_METHOD_LABELS[p.gear.brewMethod], p.gear.grinder].filter(Boolean).join(" · ");
  const stats = [
    { label: p.stats.recipes === 1 ? "Recipe" : "Recipes", value: p.stats.recipes },
    { label: p.stats.roasters === 1 ? "Roaster" : "Roasters", value: p.stats.roasters },
    { label: p.stats.reviews === 1 ? "Review" : "Reviews", value: p.stats.reviews },
  ];

  return (
    <>
      <View style={styles.head}>
        <View style={styles.avatar}>
          {p.avatarUrl ? <Image source={{ uri: p.avatarUrl }} style={StyleSheet.absoluteFill} /> : <Text style={styles.initial}>{name.slice(0, 1).toUpperCase()}</Text>}
        </View>
        <Text role="heading" style={styles.name}>
          {name}
        </Text>
        <Eyebrow>@{p.username}</Eyebrow>
        {p.bio && (
          <Body italic muted style={styles.bio}>
            {p.bio}
          </Body>
        )}
        <Body muted style={styles.center}>
          {gear ? `Brews with ${gear} · ` : ""}Member since {monthFormat.format(p.memberSince)}
        </Body>
      </View>

      <View style={styles.stats}>
        {stats.map((s, i) => (
          <View
            key={s.label}
            accessible
            aria-label={`${s.value} ${s.label}`}
            style={[styles.stat, i === 0 && styles.statFirst, i === stats.length - 1 && styles.statLast]}
          >
            <Text style={styles.statValue}>{s.value}</Text>
            <Eyebrow>{s.label}</Eyebrow>
          </View>
        ))}
      </View>

      {children}
      {!p.isYou && (
        <View style={{ alignItems: "center" }}>
          <ReportButton targetType="profile" targetId={p.username} what={`${p.username}'s profile`} ownerUsername={p.username} />
        </View>
      )}

      <View role="region" aria-label={p.isYou ? "Your Reviews" : "Reviews"} style={styles.section}>
        <Headline size="section">{p.isYou ? "Your Reviews" : "Reviews"}</Headline>
        {p.reviews.length === 0 ? (
          <Body italic muted>
            No reviews yet.
          </Body>
        ) : (
          p.reviews.map((r) => {
            const acidity = r.flavourScores?.acidity;
            return (
              <View key={r.id} style={styles.review}>
                <View style={styles.reviewHead}>
                  <Eyebrow style={styles.roaster}>{r.bean.roaster.name}</Eyebrow>
                  <Body muted style={styles.date}>
                    {dateFormat.format(r.createdAt)}
                  </Body>
                </View>
                <Link href={beanHref(r.bean)} asChild>
                  <Pressable role="link">
                    <Text style={styles.coffee}>{r.bean.name}</Text>
                  </Pressable>
                </Link>
                {(r.tastingNotes.length > 0 || acidity) && (
                  <View style={styles.panel}>
                    {r.tastingNotes.length > 0 && (
                      <View style={{ gap: 10, flexShrink: 1 }}>
                        <Eyebrow>Flavour profile</Eyebrow>
                        <View style={styles.chips}>
                          {r.tastingNotes.map((n) => (
                            <Chip key={n} small label={n} />
                          ))}
                        </View>
                      </View>
                    )}
                    {acidity ? (
                      <View accessible aria-label={`Acidity ${acidity} of 5, ${sensoryLevel("acidity", acidity)}`} style={styles.acidity}>
                        <Eyebrow>Acidity</Eyebrow>
                        <View style={styles.bar}>
                          <View style={[styles.barFill, { width: `${(acidity / 5) * 100}%` }]} />
                        </View>
                        <Body style={styles.level}>{sensoryLevel("acidity", acidity)}</Body>
                      </View>
                    ) : null}
                  </View>
                )}
                <Stars value={r.rating} />
                {r.body && <Body style={styles.quote}>“{r.body}”</Body>}
              </View>
            );
          })
        )}
      </View>

      <View role="region" aria-label={p.isYou ? "Your Recipes" : "Recipes"} style={styles.section}>
        <Headline size="section">{p.isYou ? "Your Recipes" : "Recipes"}</Headline>
        {p.recipes.length === 0 ? (
          <Body italic muted>
            No recipes yet.
          </Body>
        ) : (
          p.recipes.map((r) => (
            <Link key={r.id} href={{ pathname: "/recipe/[id]", params: { id: r.id } }} asChild>
              <Pressable role="link" aria-label={`${BREW_METHOD_LABELS[r.brewMethod]} for ${r.bean.name}`} style={styles.recipe}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.recipeTitle}>{BREW_METHOD_LABELS[r.brewMethod]}</Text>
                  <Body muted style={styles.small}>
                    {r.bean.name}
                  </Body>
                  <Body muted style={styles.small}>
                    {r.coffeeDoseG}g → {r.waterWeightG}g ({brewRatio(r.coffeeDoseG, r.waterWeightG)}){r.waterTempC ? ` · ${r.waterTempC}°C` : ""}
                  </Body>
                </View>
                <Text style={styles.upvotes}>↑ {r.upvotesCount}</Text>
              </Pressable>
            </Link>
          ))
        )}
      </View>
    </>
  );
}

const useStyles = themed((c) =>
  StyleSheet.create({
    container: { paddingHorizontal: GUTTER, paddingTop: 24, paddingBottom: 64, gap: 40 },
    message: { padding: GUTTER, gap: 16 },
    head: { alignItems: "center", gap: 8 },
    avatar: {
      width: 96,
      height: 96,
      borderRadius: radius.xl,
      overflow: "hidden",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 12,
      backgroundColor: c.surfaceContainerHigh,
    },
    initial: { fontFamily: fonts.headline, fontSize: 40, color: c.primary },
    name: { fontFamily: fonts.headline, fontSize: 36, lineHeight: 40, letterSpacing: -1, color: c.onSurface, textAlign: "center" },
    bio: { fontSize: 20, lineHeight: 26, textAlign: "center", marginTop: 4 },
    center: { textAlign: "center", fontSize: 15 },
    stats: { flexDirection: "row", gap: 4 },
    stat: { flex: 1, alignItems: "center", gap: 6, paddingVertical: 20, backgroundColor: c.surfaceContainerLow },
    statFirst: { borderTopLeftRadius: radius.lg, borderBottomLeftRadius: radius.lg },
    statLast: { borderTopRightRadius: radius.lg, borderBottomRightRadius: radius.lg },
    statValue: { fontFamily: fonts.title, fontSize: 28, color: c.primary },
    section: { gap: 24 },
    review: { gap: 14, paddingBottom: 16 },
    reviewHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 12 },
    roaster: { color: c.secondary, fontFamily: fonts.labelBold, flexShrink: 1 },
    date: { fontSize: 14 },
    coffee: { fontFamily: fonts.headline, fontSize: 26, lineHeight: 30, letterSpacing: -0.5, color: c.onSurface },
    panel: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 16, padding: 20, borderRadius: radius.lg, backgroundColor: c.surfaceContainerLow },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
    acidity: { alignItems: "flex-end", gap: 8, minWidth: 120 },
    bar: { width: 120, height: 4, borderRadius: 2, overflow: "hidden", backgroundColor: c.surfaceContainerHighest },
    barFill: { height: "100%", backgroundColor: c.primary },
    level: { fontSize: 14 },
    quote: { fontSize: 19, lineHeight: 28, color: c.onSurfaceVariant },
    recipe: { flexDirection: "row", alignItems: "center", gap: 16, padding: 16, borderRadius: radius.lg, backgroundColor: c.surfaceContainerLow },
    recipeTitle: { fontFamily: fonts.title, fontSize: 18, color: c.primary },
    small: { fontSize: 15, lineHeight: 20 },
    upvotes: { fontFamily: fonts.title, fontSize: 14, color: c.primary, paddingVertical: 8, paddingHorizontal: 12, borderRadius: radius.md, backgroundColor: c.surfaceContainerHigh },
  }),
);
