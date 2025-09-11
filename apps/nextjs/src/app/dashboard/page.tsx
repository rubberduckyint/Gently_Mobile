import { notFound } from "next/navigation";

import { appRouter, createTRPCContext } from "@gently/api";

import { AppDownloadCard } from "~/_components/dashboard/AppDownloadCard";
import { DevicesCard } from "~/_components/dashboard/DevicesCard";
import { auth, getSession } from "~/auth/server";
import { HydrateClient, prefetch, trpc } from "~/trpc/server";

export default async function DashboardPage() {
  // Get session on the server
  const session = await getSession();

  if (!session?.user) {
    return notFound();
  }

  // Create tRPC context for server-side calls
  const { headers } = await import("next/headers");
  const heads = new Headers(await headers());
  heads.set("x-trpc-source", "rsc");

  const ctx = await createTRPCContext({
    headers: heads,
    auth,
  });

  // Call the tRPC procedure directly on the server
  const caller = appRouter.createCaller(ctx);
  const devices = await caller.device.getAll({});

  // Prefetch the same data for client-side hydration
  prefetch(trpc.device.getAll.queryOptions({}));

  return (
    <HydrateClient>
      <div className="mx-auto flex w-full flex-col gap-6">
        <AppDownloadCard />
        <div className="flex flex-col gap-8">
          <DevicesCard devices={devices} />
        </div>
      </div>
    </HydrateClient>
  );
}
