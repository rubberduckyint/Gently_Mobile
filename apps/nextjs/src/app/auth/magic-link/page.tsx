"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, Smartphone, Monitor } from "lucide-react";

import { Button } from "~/_components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/_components/ui/card";
import { authClient } from "~/auth/client";

export default function MagicLinkRedirectPage() {
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    // Detect if user is on mobile device
    const userAgent = navigator.userAgent || navigator.vendor;
    const mobile = /android|iphone|ipad|ipod|blackberry|windows phone/i.test(userAgent);
    setIsMobile(mobile);

    // Try to verify the magic link
    verifyMagicLink();
  }, []);

  const verifyMagicLink = async () => {
    try {
      const token = searchParams.get("token");
      if (!token) {
        throw new Error("No verification token found");
      }

      // Verify the magic link token with better-auth
      await authClient.magicLink.verify({
        query: {
          token,
        },
      });

      // After successful verification, redirect based on device
      if (isMobile) {
        // Try to open the mobile app
        redirectToMobileApp();
      } else {
        // Redirect to web dashboard
        window.location.href = "/dashboard";
      }
    } catch (error) {
      console.error("Magic link verification failed:", error);
      setAuthError(
        error instanceof Error ? error.message : "Authentication failed"
      );
      setIsLoading(false);
    }
  };

  const redirectToMobileApp = () => {
    // Create app deep link
    const appDeepLink = "gently://auth/success";
    
    // Try to open the app
    window.location.href = appDeepLink;
    
    // For mobile browsers, also try alternative approaches
    if (isMobile) {
      // Create a temporary iframe to trigger the app
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = appDeepLink;
      document.body.appendChild(iframe);
      
      // Clean up after a short delay
      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 1000);
    }
    
    // Fallback: If app doesn't open within 3 seconds, show manual options
    setTimeout(() => {
      setIsLoading(false);
    }, 3000);
  };

  const handleOpenApp = () => {
    window.location.href = "gently://auth/success";
  };

  const handleContinueOnWeb = () => {
    window.location.href = "/dashboard";
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="flex items-center justify-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              Signing you in...
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center text-sm text-gray-600">
            <p>Verifying your magic link...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (authError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-red-600">Authentication Failed</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-center">
            <p className="text-sm text-gray-600">{authError}</p>
            <div className="space-y-2">
              <Button
                onClick={() => (window.location.href = "/login")}
                className="w-full"
              >
                Try Again
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Choose How to Continue</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-600 text-center">
            You've been successfully authenticated! How would you like to continue?
          </p>
          
          <div className="space-y-3">
            {isMobile && (
              <>
                <Button onClick={handleOpenApp} className="w-full" size="lg">
                  <Smartphone className="mr-2 h-4 w-4" />
                  Open Gently App
                </Button>
                
                <div className="text-center">
                  <p className="text-xs text-gray-500 mb-2">
                    Don't have the app yet?
                  </p>
                  <div className="flex gap-2 justify-center">
                    <Button
                      onClick={() => window.open('https://apps.apple.com/app/gently', '_blank')}
                      variant="outline"
                      size="sm"
                      className="text-xs"
                    >
                      App Store
                    </Button>
                    <Button
                      onClick={() => window.open('https://play.google.com/store/apps/details?id=com.gentlyus.gently', '_blank')}
                      variant="outline"
                      size="sm"
                      className="text-xs"
                    >
                      Play Store
                    </Button>
                  </div>
                </div>
              </>
            )}
            
            <Button 
              onClick={handleContinueOnWeb} 
              variant={isMobile ? "outline" : "default"}
              className="w-full" 
              size="lg"
            >
              <Monitor className="mr-2 h-4 w-4" />
              Continue on Web
            </Button>
          </div>

          <p className="text-xs text-gray-500 text-center">
            {isMobile 
              ? "If the app doesn't open automatically, try the app store links above or continue on web."
              : "You can also access Gently on your mobile device."
            }
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
