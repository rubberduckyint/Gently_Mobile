import { notFound } from "next/navigation";

import SettingsForm from "~/_components/settings/SettingsForm";
import { getSession } from "~/auth/server";

export default async function SettingsPage() {
  const session = await getSession();
  if (!session?.user) return notFound();

  // Fetch full user data
  const user = session.user;

  return (
    <SettingsForm
      name={user.name || ""}
      email={user.email}
      image={user.image ?? undefined}
    />
  );
}
