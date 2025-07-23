"use client";

import { useTranslations } from "next-intl";

import { Card, CardContent } from "~/_components/ui/card";
import { UsersDataTable } from "./UsersDataTable";

export default function AdminUsersPage() {
  const t = useTranslations();

  return (
    <div className="container mx-auto">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {t("admin.usersTitle")}
          </h1>
          <p className="text-muted-foreground">{t("admin.usersDescription")}</p>
        </div>
      </div>
      <Card>
        <CardContent>
          <UsersDataTable />
        </CardContent>
      </Card>
    </div>
  );
}
