import { useLocalSearchParams } from "expo-router";
import { ProfileScreen } from "@/profile";

export default function UserScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  return <ProfileScreen username={username} />;
}
