# Google Calendar Integration

## Overview
The Google Calendar integration allows users to connect their Google Calendar account and automatically create alarms for their calendar events.

## Features Implemented

### 1. Database Schema (`packages/db/src/schema.ts`)
- **CalendarConnection Table**: Stores OAuth credentials and connection metadata
  - `userId`: Links to the user account
  - `provider`: Calendar provider (currently "google")
  - `accountEmail`: Connected Google account email
  - `accessToken`: OAuth access token (encrypted)
  - `refreshToken`: OAuth refresh token for token renewal
  - `tokenExpiresAt`: Token expiration timestamp
  - `isActive`: Toggle for enabling/disabling sync
  - `lastSyncedAt`: Last successful sync timestamp

### 2. API Layer (`packages/api/src/router/calendar.ts`)
tRPC endpoints for calendar management:
- `getConnections`: List all calendar connections for the user
- `getConnection`: Get a specific connection by ID
- `createConnection`: Save OAuth credentials after successful authentication
- `updateTokens`: Update access token after refresh
- `toggleActive`: Enable/disable calendar sync
- `deleteConnection`: Remove a calendar connection
- `updateLastSynced`: Update sync timestamp

### 3. Google Calendar Service (`apps/expo/src/services/googleCalendar.ts`)
OAuth and API integration:
- **OAuth Flow**:
  - `getOAuthDiscovery()`: OAuth endpoints configuration
  - `getOAuthRequest()`: OAuth request configuration with PKCE
  - `exchangeCodeForToken()`: Exchange authorization code for tokens
  - `refreshAccessToken()`: Refresh expired access token
  
- **API Methods**:
  - `getUserEmail()`: Fetch user's Google account email
  - `fetchCalendars()`: List available calendars
  - `fetchCalendarEvents()`: Fetch events from a calendar with filters

- **TypeScript Interfaces**:
  - `GoogleCalendarEvent`: Event data structure
  - `GoogleCalendar`: Calendar metadata

### 4. UI Components

#### Calendar Connections Screen (`apps/expo/src/app/calendar/index.tsx`)
- Lists all connected Google Calendar accounts
- Shows connection status (active/inactive) and last sync time
- Toggle connections active/inactive
- Remove calendar connections
- Navigate to event selection
- Add new Google Calendar connection

#### OAuth Flow Screen (`apps/expo/src/app/calendar/connect-google.tsx`)
- Google sign-in interface
- Displays required permissions
- Handles OAuth redirect flow
- Shows progress states (authorizing, saving)
- Saves OAuth credentials to database

#### Event Selection Screen (`apps/expo/src/app/calendar/select-events.tsx`)
- Fetches upcoming events (next 30 days)
- Pull-to-refresh for event list
- Select multiple events to create alarms
- Configure alarm time (5, 15, 30, 60 minutes before event)
- Displays event details (title, time, location)
- Batch alarm creation

## Required Environment Variables

Add to `.env` or Expo configuration:
```
EXPO_PUBLIC_GOOGLE_CLIENT_ID=your-google-oauth-client-id
```

## OAuth Configuration

### Google Cloud Console Setup
1. Create OAuth 2.0 credentials
2. Add authorized redirect URIs:
   - Development: `exp://localhost:8081/--/oauth/callback`
   - Production: Your app's custom scheme (e.g., `gently://oauth/callback`)
3. Enable Google Calendar API
4. Add scopes: `https://www.googleapis.com/auth/calendar.readonly`

## Dependencies

Required packages (already installed):
- `expo-auth-session`: OAuth flow handling
- `expo-web-browser`: Browser session for OAuth
- `@tanstack/react-query`: Data fetching and caching
- `@trpc/client`: tRPC API client

## Usage Flow

1. **Connect Calendar**:
   - User navigates to calendar settings
   - Taps "Connect Google Calendar"
   - Signs in with Google
   - Grants calendar read permission
   - OAuth credentials saved to database

2. **Select Events**:
   - User views connected calendars
   - Taps "Select Events" on a connection
   - Browses upcoming events
   - Selects events to create alarms for
   - Chooses alarm timing (5-60 minutes before)

3. **Create Alarms** (To be implemented):
   - Creates alarms in the Gently device
   - Links alarms to calendar events
   - Syncs alarm changes when events update
   - Handles event cancellations

## Next Steps (Not Yet Implemented)

1. **Alarm Creation Logic**:
   - Create tRPC endpoint to convert calendar events to alarms
   - Calculate alarm time based on event start time and user's preference
   - Send alarm commands to Gently device via BLE
   - Store event-to-alarm mappings in database

2. **Auto-Sync**:
   - Background job to check for calendar updates
   - Create/update/delete alarms based on calendar changes
   - Handle event modifications and cancellations
   - Sync interval configuration

3. **Advanced Features**:
   - Calendar-specific sync settings
   - Event filtering (by keyword, calendar, etc.)
   - Default alarm preferences per calendar
   - Multiple calendar support
   - Custom alarm patterns for calendar events

## Security Considerations

- Access tokens stored encrypted in database
- Refresh tokens used to maintain long-term access
- PKCE used for OAuth flow security
- User can revoke access at any time
- Tokens automatically refreshed before expiration

## Error Handling

- Token refresh on expiration
- OAuth cancellation handling
- Network error recovery
- Missing permission detection
- Invalid calendar/event handling
