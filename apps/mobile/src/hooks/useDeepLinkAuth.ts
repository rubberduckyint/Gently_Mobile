import { useEffect } from "react";
import { Linking } from "react-native";
import { router } from "expo-router";

import { authClient } from "~/utils/auth";

export const useDeepLinkAuth = () => {
  useEffect(() => {
    // Handle deep links when the app is already running
    const handleDeepLink = (event: { url: string }) => {
      console.log("Deep link received:", event.url);
      handleAuthDeepLink(event.url);
    };

    // Handle deep links when the app is opened from a closed state
    const handleInitialURL = async () => {
      try {
        const initialURL = await Linking.getInitialURL();
        if (initialURL) {
          console.log("Initial URL:", initialURL);
          handleAuthDeepLink(initialURL);
        }
      } catch (error) {
        console.error("Error getting initial URL:", error);
      }
    };

    // Add event listener for deep links
    const subscription = Linking.addEventListener("url", handleDeepLink);

    // Check for initial URL
    handleInitialURL();

    // Cleanup
    return () => {
      subscription?.remove();
    };
  }, []);

  const handleAuthDeepLink = async (url: string) => {
    try {
      console.log("Processing auth deep link:", url);
      
      // Check if this is an auth success deep link
      if (url.includes("gently://auth/success")) {
        console.log("Auth success deep link detected");
        
        // Check if user is now authenticated
        const session = await authClient.getSession();
        
        if (session?.data?.user) {
          console.log("User authenticated via deep link:", session.data.user.email);
          // Navigate to dashboard
          router.replace("/dashboard");
        } else {
          console.log("No session found after deep link");
          // Stay on login page or show error
          router.replace("/");
        }
      }
    } catch (error) {
      console.error("Error handling auth deep link:", error);
      // Navigate back to login on error
      router.replace("/");
    }
  };
};
