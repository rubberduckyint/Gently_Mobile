import { Suspense } from "react";

import { HydrateClient, prefetch, trpc } from "~/trpc/server";
import { UserDetailsView } from "./UserDetailsView";

interface UserPageProps {
  params: Promise<{ id: string }>;
}

export default async function UserPage({ params }: UserPageProps) {
  const { id } = await params;

  // Prefetch the user data for better performance
  prefetch(trpc.admin.getUserById.queryOptions({ id }));

  return (
    <HydrateClient>
      <div className="container mx-auto">
        <Suspense fallback={<UserDetailsSkeleton />}>
          <UserDetailsView userId={id} />
        </Suspense>
      </div>
    </HydrateClient>
  );
}

function UserDetailsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-32 animate-pulse rounded bg-muted" />
      <div className="h-48 animate-pulse rounded bg-muted" />
      <div className="h-64 animate-pulse rounded bg-muted" />
    </div>
  );
}
