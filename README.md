# Gently App

A comprehensive health management platform featuring a React Native mobile app and Next.js web application designed to work seamlessly with Gently smart bracelets for medication reminders and health tracking.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Development Setup](#development-setup)
- [Environment Configuration](#environment-configuration)
- [Mobile Development](#mobile-development)
- [BLE Protocol](#ble-protocol)
- [Authentication](#authentication)
- [Apple App Review Test Mode](#apple-app-review-test-mode)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)

## Overview

The Gently app ecosystem consists of a mobile application built with React Native/Expo and a web dashboard built with Next.js. The mobile app connects to Gently smart bracelets via Bluetooth Low Energy (BLE) to manage medication reminders, alarms, and health tracking features.

### Key Technologies

- **Mobile**: React Native with Expo SDK 53, React 19
- **Web**: Next.js 15, React 19
- **Authentication**: Better-Auth with OTP, Google, and Apple Sign In
- **Database**: Drizzle ORM with PostgreSQL
- **Styling**: Tailwind CSS / NativeWind
- **Monorepo**: Turborepo with PNPM
- **Type Safety**: End-to-end TypeScript with tRPC

## Features

### Mobile App

- 🔗 **BLE Device Management** - Connect and manage Gently smart bracelets
- 💊 **Medication Reminders** - Set, modify, and sync alarms with the bracelet
- 🔐 **Secure Communication** - TEA encryption for BLE data transmission
- 📱 **Cross-Platform** - iOS and Android support
- 🎨 **Native UI** - Consistent design with custom navigation

### Web Dashboard

- 👤 **User Management** - Admin panel for user accounts
- 📊 **Device Analytics** - Monitor device usage and health metrics
- 🔑 **Authentication** - OTP, Google, and Apple Sign In support
- ⚡ **Real-time Updates** - Live sync with mobile app data

### Smart Bracelet Integration

- ⏰ **Alarm Management** - Create, modify, and delete medication reminders
- 🔋 **Battery Monitoring** - Real-time battery status notifications
- 🔍 **Find Device** - Locate misplaced bracelets
- 📡 **Secure BLE Protocol** - Encrypted communication with TEA algorithm

## Quick Start

> **System Requirements**: Node.js ≥22.11.0, PNPM ≥10.18.1

### 1. Clone and Install

```bash
# Install dependencies
pnpm install

# Copy environment configuration
cp .env.example .env

# Start Docker services (database + mailhog)
docker-compose up -d

# Configure your environment variables (see Environment Configuration)
# Then push database schema and start development
pnpm db:push
pnpm dev
```

### 2. Access the Applications

- **Next.js Web App**: <http://localhost:3000>
- **Expo Mobile App**: Use Expo Go app or run on simulator

## Architecture

The Gently app uses a modern monorepo architecture built with Turborepo:

```text
apps/
├── expo/                    # React Native mobile app
│   ├── src/app/            # Expo Router pages
│   ├── src/services/ble/   # Bluetooth Low Energy services
│   └── BLE_protocol.md     # Device communication protocol
└── nextjs/                 # Next.js web dashboard
    └── src/app/            # App Router pages

packages/
├── api/                    # tRPC API definitions
├── auth/                   # Better-Auth configuration
├── db/                     # Drizzle database schema
├── email/                  # Email service utilities
└── validators/             # Shared Zod schemas

tooling/
├── eslint/                 # Shared ESLint configurations
├── prettier/               # Code formatting rules
├── typescript/             # TypeScript configurations
└── github/                 # CI/CD workflows
```

## Development Setup

### Prerequisites

- Node.js ≥22.11.0
- PNPM ≥10.18.1
- Android Studio (for Android development)
- Xcode (for iOS development, macOS only)
- Expo CLI: `pnpm add -g @expo/cli`

### Initial Setup

```bash
git clone <repository-url>
cd gently
pnpm install
cp .env.example .env
```

### Docker Development Environment

The project includes a Docker Compose setup for local development with PostgreSQL database and MailHog for email testing.

#### Starting Docker Services

```bash
# Start all services (database + mailhog)
docker-compose up -d

# View running containers
docker ps

# Stop all services
docker-compose down
```

#### Included Services

- **PostgreSQL Database**:
  - **Host**: `localhost:5832`
  - **Database**: `gently`
  - **Username**: `gently`
  - **Password**: `gently`
  - **Connection String**: `postgresql://gently:gently@localhost:5832/gently`

- **MailHog Email Testing**:
  - **SMTP Server**: `localhost:1025`
  - **Web Interface**: <http://localhost:8025>
  - **Purpose**: Captures all outgoing emails for testing OTP and magic links

#### Database Setup with Docker

```bash
# Start Docker services
docker-compose up -d

# Push database schema
pnpm db:push

# (Optional) Open database studio
pnpm db:studio
```

## Environment Configuration

### Required Environment Variables

Copy the example file and configure with your values:

```bash
cp .env.example .env
```

#### Database Configuration

````bash
```env
# Database (Required) - Use Docker setup
POSTGRES_URL="postgresql://gently:gently@localhost:5832/gently"

# Authentication (Required)
AUTH_SECRET="supersecret"  # Generate with: openssl rand -base64 32

# Apple Sign In (Optional)
APPLE_CLIENT_ID="com.gentlyus.gently.web"
APPLE_CLIENT_SECRET="your-apple-client-secret-jwt"

# Google OAuth (Optional)
GOOGLE_CLIENT_ID="your-google-client-id.googleusercontent.com"
GOOGLE_CLIENT_SECRET="your-google-client-secret"

# Email Configuration (MailHog for development)
EMAIL_SERVER_HOST="localhost"
EMAIL_SERVER_PORT="1025"
EMAIL_SERVER_USER=""  # Leave empty for MailHog
EMAIL_SERVER_PASSWORD=""  # Leave empty for MailHog
EMAIL_FROM="noreply@gently.dev"

# API Endpoints
NEXT_PUBLIC_BASE_URL="http://localhost:3000"
EXPO_PUBLIC_BASE_URL="http://localhost:3000"  # Use your local IP for physical devices
````

> **Development Tip**: When testing on physical devices, replace `localhost` with your computer's IP address (e.g., `http://192.168.1.100:3000`)

#### OAuth Provider Setup

##### Apple Sign In (Optional)

1. **Apple Developer Account**: Create an App ID and Service ID
2. **Generate Client Secret**: Create a JWT client secret using your Apple credentials
3. **Environment Variable**: Add `APPLE_CLIENT_SECRET` to your `.env` file

The client secret should be a JWT token signed with your Apple private key. You can generate this using tools like:

- Apple's official client secret generator
- Third-party JWT generators with ES256 support
- Custom scripts using your Apple private key (.p8 file)

##### Google OAuth (Optional)

1. **Google Cloud Console**: Create a new project or use existing
2. **Enable APIs**: Enable Google+ API and Google OAuth2 API
3. **Create Credentials**: Create OAuth 2.0 Client IDs
4. **Configure Domains**: Add your development and production URLs
5. **Environment Variables**: Add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`

##### OTP Authentication (Default)

OTP (One-Time Password) authentication works out of the box with MailHog for development:

- **Development**: Emails are captured by MailHog at <http://localhost:8025>
- **Production**: Configure a real SMTP server in production environment

For detailed setup, see the [Better-Auth documentation](https://www.better-auth.com/docs/authentication/social-signin).

## Mobile Development

### iOS Development

#### iOS Requirements

- macOS with Xcode installed
- iOS Simulator or physical iOS device
- Apple Developer account (for device testing)

```bash

```

Update the `.env` file with your specific configuration:

```bash
# Database
POSTGRES_URL="postgresql://gently:gently@localhost:5832/gently"

# Authentication
AUTH_SECRET='supersecret'  # Generate with: openssl rand -base64 32

# Email Configuration (for magic link authentication)
EMAIL_SERVER_HOST="smtp.gmail.com"
EMAIL_SERVER_PORT="587"
EMAIL_SERVER_USER="your-email@gmail.com"
EMAIL_SERVER_PASSWORD="your-app-password"
EMAIL_FROM="noreply@yourdomain.com"

# Base URLs for API communication
NEXT_PUBLIC_BASE_URL=http://localhost:3000
EXPO_PUBLIC_BASE_URL=http://localhost:3000
```

> **Important**: When developing with Expo on a physical device, replace `localhost` in `EXPO_PUBLIC_BASE_URL` with your computer's local IP address (e.g., `http://192.168.1.100:3000`). You can find your IP with `ipconfig` (Windows) or `ifconfig` (Mac/Linux).

#### Expo-Specific Environment Variables

The Expo app requires `EXPO_PUBLIC_BASE_URL` to communicate with your backend. This should point to:

- **Development**: Your local development server (e.g., `http://192.168.1.100:3000`)
- **Production**: Your deployed Next.js app URL (e.g., `https://your-app.vercel.app`)

#### Setup Steps

```bash
# Start iOS development
cd apps/expo
pnpm dev:ios

# Or run in specific simulator
pnpm expo start --ios
```

### Android Development

#### Android Prerequisites

1. **Install Android Studio**: Download from [developer.android.com](https://developer.android.com/studio)
2. **Configure SDK**: Install Android SDK and create virtual device
3. **Set environment variables**:

```bash
# Add to ~/.zshrc or ~/.bashrc
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools
```

#### Android Development Commands

```bash
# Start Android development
cd apps/expo
pnpm dev:android

# Or run on specific device
pnpm expo start --android
```

## BLE Protocol

The Gently app communicates with smart bracelets using a secure Bluetooth Low Energy protocol with TEA encryption. Key features:

### Supported Commands

- **Device Management**: Get device info, battery status, find device
- **Alarm Operations**: Add, modify, delete, and sync medication reminders
- **Time Synchronization**: Keep bracelet time accurate
- **Secure Communication**: All data encrypted with TEA algorithm

### Protocol Documentation

Detailed BLE protocol specifications are available in [`apps/expo/BLE_protocol.md`](./apps/expo/BLE_protocol.md), including:

- Packet formats and encryption
- Command specifications
- Response handling
- Security implementation

## Authentication

### Better-Auth Integration

The app uses Better-Auth for authentication with multiple sign-in options:

- **OTP (One-Time Password)**: Email-based authentication with magic links
- **Google OAuth**: Sign in with Google accounts
- **Apple Sign In**: Sign in with Apple ID (iOS/macOS)
- **Session Management**: Secure JWT tokens
- **Cross-Platform**: Shared auth state between web and mobile

### Development Authentication

#### Email Testing with MailHog

- **MailHog Interface**: <http://localhost:8025>
- **Purpose**: Captures all outgoing emails (OTP codes, magic links)
- **SMTP**: `localhost:1025` (configured in Docker setup)

#### OAuth Development

- **Google OAuth**: Works in development with proper client configuration
- **Apple Sign In**: Requires production domain for full testing
- **Auth Proxy**: Better-Auth proxy enables OAuth in development/preview deployments

### Production Notes

- **Apple Client Secret**: Use pre-generated JWT client secret from environment variable
- **Email Service**: Replace MailHog with production SMTP service (AWS SES, SendGrid, etc.)
- **OAuth Domains**: Configure production URLs in Google/Apple developer consoles
- **Security**: Ensure all secrets are properly secured in production environment

## Apple App Review Test Mode

The app includes a special test mode designed for Apple App Store review. This allows Apple reviewers to test the full app functionality without requiring a physical Gently device or access to a real email account.

### Test User Credentials

| Field        | Value                               |
| ------------ | ----------------------------------- |
| **Email**    | `extraspecialtestuser@gentlyus.com` |
| **OTP Code** | `123456`                            |

### How It Works

1. **Login Flow**:
   - Enter the test email address on the login screen
   - Tap "Send Verification Code" (no actual email is sent)
   - Enter `123456` as the OTP code
   - The test user is authenticated and redirected to the dashboard

2. **Device Pairing**:
   - Navigate to "Add a Gently" screen
   - A yellow "Test Mode" section appears (only visible for the test user)
   - Tap "Simulate Device Pairing" to create a mock device
   - The simulated device appears with realistic dummy data (85% battery, firmware 1.0.0)
   - Name the device and it's added to the account

3. **Bluetooth Bypass** (NEW):
   - All Bluetooth operations are automatically simulated for the test user
   - No need to pair with a physical device - scanning and connection work automatically
   - All BLE commands (add alarm, sync time, get battery, etc.) return mock responses
   - Alarms and events are stored in-memory and work as if on a real device
   - Mock device: "Test Gently Device" (Serial: GENTLY-TEST-001)

4. **Full Functionality**:
   - Create, edit, and delete alarms on the simulated device
   - All app features work normally with the test device
   - No physical Gently bracelet or BLE connection required
   - Test user can use the regular "Scan for Devices" flow which will find the simulated device

### Technical Implementation

The test mode is implemented across several files:

- **`apps/expo/src/utils/testMode.ts`** - Test user constants and helper functions
- **`packages/auth/src/index.ts`** - Server-side OTP generation for test user
- **`apps/expo/src/app/index.tsx`** - Client-side login handling
- **`apps/expo/src/app/add-device/index.tsx`** - Simulated device pairing UI
- **`apps/expo/src/services/ble/mockBLEService.ts`** - Mock Bluetooth service for test users (NEW)
- **`apps/expo/src/contexts/BLEContext.tsx`** - Automatic routing to mock BLE for test users (NEW)

The BLE bypass works by:

1. Detecting when the logged-in user is the test user (`extraspecialtestuser@gentlyus.com`)
2. Routing all Bluetooth operations to the mock service instead of real BLE hardware
3. Simulating device discovery, connection, commands, and notifications
4. Maintaining in-memory state for alarms and device settings

### Security Notes

- Test mode only activates for the exact email `extraspecialtestuser@gentlyus.com`
- The fixed OTP (`123456`) is only generated server-side for this specific email
- Regular users always receive randomly generated OTPs via email
- Test mode UI elements are only visible when logged in as the test user

## Deployment

### Web Application (Next.js)

#### Vercel Deployment

1. **Create Vercel Project**: Select `apps/nextjs` as root directory
2. **Environment Variables**: Add all required variables from `.env`
3. **Deploy**: Vercel handles build configuration automatically

#### Environment Variables for Production

```env
POSTGRES_URL="your-production-database-url"
AUTH_SECRET="your-production-secret"
APPLE_CLIENT_ID="com.gentlyus.gently.web"
APPLE_CLIENT_SECRET="your-apple-client-secret-jwt"
GOOGLE_CLIENT_ID="your-google-client-id.googleusercontent.com"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
```

### Mobile Application (Expo)

#### Production Build

```bash
# Install EAS CLI
pnpm add -g eas-cli

# Configure builds
cd apps/expo
eas build:configure

# Create production builds
eas build --platform ios --profile production
eas build --platform android --profile production
```

#### App Store Submission

```bash
# Submit to app stores
eas submit --platform ios --latest
eas submit --platform android --latest
```

## Troubleshooting

### Common Issues

#### BLE Connection Problems

- **Device not found**: Ensure Bluetooth is enabled and device is in pairing mode
- **Connection timeouts**: Check device proximity and interference
- **Encryption errors**: Verify TEA key synchronization

#### Authentication Issues

- **Apple Sign In fails**: Check Apple Developer configuration and private key format
- **JWT errors**: Ensure private key is PKCS#8 format (`-----BEGIN PRIVATE KEY-----`)
- **Session expired**: Verify `AUTH_SECRET` configuration

#### Development Environment

- **Metro bundler issues**: Clear cache with `pnpm expo start --clear`
- **TypeScript errors**: Run `pnpm typecheck` to identify issues
- **Database connection**: Verify `POSTGRES_URL` and run `pnpm db:push`

### Debugging Commands

```bash
# Clear all caches
pnpm clean:workspaces

# Type checking
pnpm typecheck

# Database operations
pnpm db:studio    # Open database GUI
pnpm db:push      # Push schema changes

# Linting and formatting
pnpm lint:fix
pnpm format:fix
```

## Contributing

### Development Workflow

1. **Clone repository**: `git clone <repo-url>`
2. **Install dependencies**: `pnpm install`
3. **Create feature branch**: `git checkout -b feature/your-feature`
4. **Make changes**: Follow coding standards
5. **Test thoroughly**: Run tests and manual testing
6. **Submit PR**: Include detailed description

### Code Standards

- **TypeScript**: Strict type checking enabled
- **ESLint**: Configured for React/React Native
- **Prettier**: Consistent code formatting
- **Monorepo**: Use workspace dependencies where possible

### Testing

- **Mobile App**: Test on both iOS and Android
- **BLE Features**: Test with actual Gently device
- **Authentication**: Verify all auth flows
- **Cross-platform**: Ensure consistency between web and mobile

---

## References

- **Better-Auth**: [Authentication Documentation](https://www.better-auth.com)
- **Expo**: [React Native Framework](https://expo.dev)
- **Next.js**: [Web Framework](https://nextjs.org)
- **Turborepo**: [Monorepo Tool](https://turborepo.org)
- **Drizzle ORM**: [Database Toolkit](https://orm.drizzle.team)

Built with ❤️ for better health management.

### Package Management

#### Adding UI Components

```bash
# Add shadcn/ui components
pnpm ui-add
```

#### Creating New Packages

```bash
# Generate new package in monorepo
pnpm turbo gen init
```

This will create a new package with proper TypeScript, ESLint, and Prettier configuration.
