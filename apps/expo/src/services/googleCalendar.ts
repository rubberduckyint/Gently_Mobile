/**
 * Google Calendar Integration Service
 * Handles OAuth flow and fetching calendar events
 */

import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";

// Enable browser session completion
WebBrowser.maybeCompleteAuthSession();

const GOOGLE_OAUTH_CONFIG = {
  clientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || "",
  scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
  redirectUri: AuthSession.makeRedirectUri({
    scheme: "gently",
    path: "oauth/callback",
  }),
};

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
}

export interface GoogleCalendar {
  id: string;
  summary: string;
  description?: string;
  primary?: boolean;
  backgroundColor?: string;
}

/**
 * Create OAuth discovery configuration
 */
export const getOAuthDiscovery = () => ({
  authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenEndpoint: "https://oauth2.googleapis.com/token",
  revocationEndpoint: "https://oauth2.googleapis.com/revoke",
});

/**
 * Create OAuth request configuration
 */
export const getOAuthRequest = () => ({
  clientId: GOOGLE_OAUTH_CONFIG.clientId,
  scopes: GOOGLE_OAUTH_CONFIG.scopes,
  redirectUri: GOOGLE_OAUTH_CONFIG.redirectUri,
  responseType: AuthSession.ResponseType.Code,
  usePKCE: true,
});

/**
 * Exchange authorization code for access token
 */
export async function exchangeCodeForToken(
  code: string,
  codeVerifier: string,
): Promise<{
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
}> {
  const tokenEndpoint = "https://oauth2.googleapis.com/token";

  const response = await fetch(tokenEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_OAUTH_CONFIG.clientId,
      redirect_uri: GOOGLE_OAUTH_CONFIG.redirectUri,
      grant_type: "authorization_code",
      code_verifier: codeVerifier,
    }).toString(),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Token exchange failed: ${JSON.stringify(error)}`);
  }

  const data = await response.json();

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  };
}

/**
 * Refresh an expired access token
 */
export async function refreshAccessToken(
  refreshToken: string,
): Promise<{
  accessToken: string;
  expiresIn: number;
}> {
  const tokenEndpoint = "https://oauth2.googleapis.com/token";

  const response = await fetch(tokenEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: GOOGLE_OAUTH_CONFIG.clientId,
      grant_type: "refresh_token",
    }).toString(),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Token refresh failed: ${JSON.stringify(error)}`);
  }

  const data = await response.json();

  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in,
  };
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
