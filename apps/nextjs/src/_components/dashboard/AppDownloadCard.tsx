import { Play, Store } from "lucide-react";

import { Button } from "~/_components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "~/_components/ui/card";

export function AppDownloadCard() {
  return (
    <Card className="border-primary/20 w-full rounded-lg border shadow">
      <CardHeader>
        <CardTitle>Get the Gently App</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center gap-4 md:flex-row">
          <div className="flex-1 text-center md:text-left">
            <p className="text-muted-foreground mb-2">
              To add a Gently device, download our app and follow the
              instructions to get started.
            </p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline" className="gap-2">
              <a
                href="https://apps.apple.com/app/apple-store/id0000000000"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Download on the App Store"
              >
                <Store className="h-5 w-5" />
                App Store
              </a>
            </Button>
            <Button asChild variant="outline" className="gap-2">
              <a
                href="https://play.google.com/store/apps/details?id=com.gently"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Get it on Google Play"
              >
                <Play className="h-5 w-5" />
                Google Play
              </a>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
