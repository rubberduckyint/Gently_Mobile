/**
 * Google Calendar Integration Service
 * Uses the same Google Sign-In flow as login (@react-native-google-signin)
 */

import {
  GoogleSignin,
  statusCodes,
  type User,
} from "@react-native-google-signin/google-signin";

const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";

export interface GoogleCalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  location?: string;
  status: string;
  htmlLink: string;
  // Recurring event fields
  recurringEventId?: string; // ID of the parent recurring event
  recurrence?: string[]; // RRULE strings like "RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR"
}

export interface GoogleCalendar {
  id: string;
  summary: string;
  description?: string;
  primary?: boolean;
  backgroundColor?: string;
}

export interface GoogleSignInResult {
  accessToken: string;
  refreshToken?: string;
  email: string;
  expiresAt: Date;
}

/**
 * Sign in with Google and get calendar access
 * Always requests calendar scope - will prompt user if not already granted
 */
export async function signInWithGoogle(): Promise<GoogleSignInResult> {
  try {
    console.log("[Calendar] Starting calendar sign-in flow...");
    
    // Check current user state BEFORE any configuration
    const currentUser = GoogleSignin.getCurrentUser();
    console.log("[Calendar] Current user:", currentUser?.user?.email ?? "none");
    console.log("[Calendar] Current scopes:", currentUser?.scopes ?? "none");
    
    // Check if we already have the calendar scope
    const hasCalendarScope = currentUser?.scopes?.includes(CALENDAR_SCOPE) ?? false;
    console.log("[Calendar] Has calendar scope:", hasCalendarScope);
    
    let email: string | undefined;
    
    if (currentUser && hasCalendarScope) {
      // Already have the scope - use existing session
      console.log("[Calendar] Already have calendar scope, using existing session");
      email = currentUser.user.email;
    } else {
      // Need to get calendar scope - either user not signed in or doesn't have scope
      console.log("[Calendar] Need calendar scope, will do fresh sign-in flow...");
      
      // ALWAYS sign out first to force fresh OAuth with proper scopes
      // This is necessary because addScopes() is unreliable on iOS
      if (currentUser) {
        console.log("[Calendar] Signing out current user to force fresh OAuth...");
        try {
          await GoogleSignin.signOut();
        } catch (signOutError) {
          console.log("[Calendar] signOut error (continuing anyway):", signOutError);
        }
      }
      
      // Clear any cached tokens to ensure we get fresh ones
      try {
        await GoogleSignin.clearCachedAccessToken(
          (await GoogleSignin.getTokens().catch(() => ({ accessToken: "" }))).accessToken
        );
      } catch {
        // Ignore - tokens might not exist
      }
      
      // Reconfigure with calendar scope BEFORE signing in
      // This ensures the sign-in request includes the calendar scope
      console.log("[Calendar] Configuring GoogleSignin with calendar scope...");
      GoogleSignin.configure({
        webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
        // Don't pass iosClientId here - it's already configured in Info.plist via the plugin
        // Passing a different value causes "Inconsistency detected" error
        scopes: [CALENDAR_SCOPE],
        offlineAccess: true,
        // Force account selection to ensure fresh consent
        forceCodeForRefreshToken: true,
      });
      
      // Now do a fresh sign-in which should show the Google account picker
      // and consent screen with calendar scope
      console.log("[Calendar] Starting fresh signIn with calendar scope...");
      const signInResult = await GoogleSignin.signIn();
      console.log("[Calendar] signIn result:", signInResult);
      console.log("[Calendar] signIn scopes:", signInResult.data?.scopes);
      
      email = signInResult.data?.user.email;
      
      // Verify we got the calendar scope
      const freshUser = GoogleSignin.getCurrentUser();
      console.log("[Calendar] Fresh user scopes after signIn:", freshUser?.scopes);
      
      if (!freshUser?.scopes?.includes(CALENDAR_SCOPE)) {
        console.warn("[Calendar] WARNING: Calendar scope not in user scopes!");
        // Still continue - we'll verify with an actual API call
      }
    }

    if (!email) {
      throw new Error("Could not get email from Google Sign-In");
    }

    // Get fresh access token
    console.log("[Calendar] Getting tokens...");
    const tokens = await GoogleSignin.getTokens();
    console.log("[Calendar] Got tokens, accessToken length:", tokens.accessToken?.length);
    
    if (!tokens.accessToken) {
      throw new Error("No access token received from Google");
    }

    // Verify the token actually has calendar scope by making a test API call
    console.log("[Calendar] Verifying token has calendar access...");
    const testResponse = await fetch(
      "https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=1",
      {
        headers: {
          Authorization: `Bearer ${tokens.accessToken}`,
        },
      }
    );
    
    if (!testResponse.ok) {
      const errorText = await testResponse.text();
      console.log("[Calendar] Token verification failed:", testResponse.status, errorText);
      
      if (testResponse.status === 403 || testResponse.status === 401) {
        throw new Error(
          "Calendar access not granted. Please sign in again and make sure to accept the 'View your calendars' permission."
        );
      }
      throw new Error(`Calendar API error: ${testResponse.status}`);
    }
    
    console.log("[Calendar] Token verification successful - calendar access confirmed!");

    // Calculate expiration (tokens typically expire in 1 hour)
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);

    return {
      accessToken: tokens.accessToken,
      email,
      expiresAt,
    };
  } catch (error: unknown) {
    console.log("[Calendar] Error:", error);
    const googleError = error as { code?: string };
    
    if (googleError.code === "SIGN_IN_CANCELLED") {
      throw new Error("Sign in cancelled");
    } else if (googleError.code === statusCodes.IN_PROGRESS) {
      throw new Error("Sign in already in progress");
    } else if (googleError.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
      throw new Error("Google Play Services not available");
    }
    
    throw error;
  }
}

/**
 * Get current access token (refreshes if needed)
 */
export async function getAccessToken(): Promise<string> {
  try {
    const tokens = await GoogleSignin.getTokens();
    return tokens.accessToken;
  } catch {
    // Token might be expired, try to refresh
    await GoogleSignin.signInSilently();
    const tokens = await GoogleSignin.getTokens();
    return tokens.accessToken;
  }
}

/**
 * Refresh access token
 * Note: GoogleSignin.getTokens() handles refresh automatically
 */
export async function refreshAccessToken(
  _refreshToken: string,
): Promise<{
  accessToken: string;
  expiresIn: number;
}> {
  try {
    await GoogleSignin.signInSilently();
    const tokens = await GoogleSignin.getTokens();
    
    return {
      accessToken: tokens.accessToken,
      expiresIn: 3600, // 1 hour
    };
  } catch (error) {
    throw new Error("Failed to refresh token. Please reconnect your calendar.");
  }
}

/**
 * Sign out from Google (for calendar purposes)
 */
export async function signOutFromGoogle(): Promise<void> {
  try {
    await GoogleSignin.signOut();
  } catch (error) {
    console.error("Error signing out from Google:", error);
  }
}

/**
 * Fetch user's calendar list
 */
export async function fetchCalendars(
  accessToken: string,
): Promise<GoogleCalendar[]> {
  const response = await fetch(
    "https://www.googleapis.com/calendar/v3/users/me/calendarList",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch calendars: ${response.statusText}`);
  }

  const data = await response.json();
  return data.items || [];
}

/**
 * Fetch events from a specific calendar
 */
export async function fetchCalendarEvents(
  accessToken: string,
  calendarId: string = "primary",
  options?: {
    timeMin?: Date;
    timeMax?: Date;
    maxResults?: number;
    singleEvents?: boolean;
    orderBy?: "startTime" | "updated";
  },
): Promise<GoogleCalendarEvent[]> {
  const params = new URLSearchParams({
    singleEvents: String(options?.singleEvents ?? true),
    orderBy: options?.orderBy ?? "startTime",
    maxResults: String(options?.maxResults ?? 50),
  });

  if (options?.timeMin) {
    params.append("timeMin", options.timeMin.toISOString());
  }

  if (options?.timeMax) {
    params.append("timeMax", options.timeMax.toISOString());
  }

  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch events: ${response.statusText}`);
  }

  const data = await response.json();
  return data.items || [];
}

/**
 * Get user's email from access token
 */
export async function getUserEmail(accessToken: string): Promise<string> {
  const response = await fetch(
    "https://www.googleapis.com/oauth2/v2/userinfo",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch user info: ${response.statusText}`);
  }

  const data = await response.json();
  return data.email;
}
