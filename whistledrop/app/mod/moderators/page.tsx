import type { Metadata } from "next";
import { Moderators } from "./Moderators";

export const metadata: Metadata = { title: "Moderators" };

export default function ModModeratorsPage() {
  return <Moderators />;
}
