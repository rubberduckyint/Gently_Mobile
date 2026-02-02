# Gently App - Copilot Instructions

## Overview

The Gently app is a comprehensive health management platform featuring:
- **Mobile App**: React Native/Expo mobile application for iOS and Android
- **Web Dashboard**: Next.js web application for user and device management
- **Smart Bracelet Integration**: BLE-connected wearable devices for medication reminders

A Gently device is a smart bracelet that connects via Bluetooth Low Energy (BLE) to set alarms, reminders for medication, and other health-related tasks. The app uses secure TEA encryption for BLE communication.

## Technology Stack

- **Frontend**: React 19, TypeScript
- **Mobile**: Expo SDK 53, React Native, NativeWind (Tailwind CSS)
- **Web**: Next.js 15, Tailwind CSS
- **Backend**: tRPC, Better-Auth
- **Database**: PostgreSQL with Drizzle ORM
- **Monorepo**: Turborepo with PNPM workspace
- **Code Quality**: ESLint, Prettier, TypeScript strict mode

## Repository Structure

```
apps/
├── expo/                      # React Native mobile app
│   ├── src/app/              # Expo Router pages
│   ├── src/services/ble/     # Bluetooth Low Energy services
│   └── BLE_protocol.md       # Device communication protocol
└── nextjs/                   # Next.js web dashboard
    └── src/app/              # App Router pages

packages/
├── api/                      # tRPC API definitions
├── auth/                     # Better-Auth configuration
├── db/                       # Drizzle database schema
├── email/                    # Email service utilities
├── shared/                   # Shared utilities
└── validators/               # Shared Zod schemas

tooling/
├── eslint/                   # Shared ESLint configurations
├── prettier/                 # Code formatting rules
├── typescript/               # TypeScript configurations
└── github/                   # CI/CD workflows
```

## Development Workflow

### Prerequisites
- Node.js >= 22.11.0
- PNPM >= 10.18.1
- Docker (for local PostgreSQL and MailHog)

### Key Commands

**Always run from the workspace root:**

```bash
# Development
pnpm dev                      # Start all apps in watch mode
pnpm dev:next                 # Start Next.js app only
cd apps/expo && pnpm dev:ios  # Start iOS app
cd apps/expo && pnpm dev:android  # Start Android app

# Code Quality (MUST run before completing work)
pnpm typecheck 2>&1 | head -100   # Type check all packages
pnpm lint 2>&1 | head -100        # Lint all packages
pnpm format 2>&1 | head -100      # Check formatting

# Fixes
pnpm lint:fix                 # Auto-fix lint issues
pnpm format:fix               # Auto-format code

# Database
pnpm db:push                  # Push schema changes to database
pnpm db:studio                # Open Drizzle Studio GUI

# Build
pnpm build                    # Build all packages

# Cleanup
pnpm clean:workspaces         # Clean all workspace caches
```

**Important**: Always pipe typecheck, lint, and format output through `head -100` to avoid alternate buffer mode and ensure results are readable.

### After Completing Work

**Always** run these checks in order before considering work complete:
1. `pnpm typecheck 2>&1 | head -100` - Must pass with no errors
2. `pnpm lint 2>&1 | head -100` - Must pass with no errors
3. `pnpm format 2>&1 | head -100` - Must show no formatting issues

## Code Style and Conventions

### TypeScript
- Use strict TypeScript - no `any` types
- Prefer type inference over explicit types
- Use Zod schemas for runtime validation (defined in `packages/validators`)
- Export types from package-level `index.ts` files

### React/React Native
- Use functional components with hooks
- Follow React 19 conventions
- Use tRPC for API calls (type-safe)
- Prefer composition over inheritance

### Mobile App (Expo)
- **Always use global styling** defined in `apps/expo/src/styles`
- **Do NOT use the Expo default navigation bar** - create custom navigation for consistency
- Use NativeWind (Tailwind CSS) for styling
- Follow responsive design guidelines in `apps/expo/RESPONSIVE_DESIGN.md`
- Refer to `apps/expo/BLE_protocol.md` for BLE device communication

### Web App (Next.js)
- Use App Router (not Pages Router)
- Use Server Components by default
- Add `"use client"` directive only when necessary
- Use Tailwind CSS for styling

### Database
- Define schemas in `packages/db/src/schema`
- Use Drizzle ORM for queries
- Run `pnpm db:push` after schema changes
- Never modify production database directly

### Testing
- Test BLE features with actual devices when possible
- Use test mode for Apple App Review (see README.md)
- Test on both iOS and Android platforms
- Verify authentication flows end-to-end

## Boundaries and Exclusions

### DO NOT Touch
- `.env` files - contains secrets
- `node_modules/` - managed by PNPM
- `dist/` and `build/` directories - generated files
- `.cache/` directories - build caches
- `pnpm-lock.yaml` - managed by PNPM (unless adding/updating dependencies)
- `.github/workflows/` - CI/CD configuration (unless specifically asked)
- Production configuration files
- Private keys and certificates

### Security Considerations
- Never commit secrets or API keys
- Use environment variables for all sensitive data
- Follow TEA encryption protocol for BLE (see `BLE_protocol.md`)
- Validate all user inputs with Zod schemas
- Use Better-Auth for authentication (already configured)

## BLE Protocol

The app communicates with Gently smart bracelets using a secure BLE protocol with TEA encryption.

### Key Points
- All BLE payloads are encrypted using TEA algorithm
- Commands are defined in `apps/expo/BLE_protocol.md`
- Supported operations: device info, battery status, alarm management, time sync
- Always handle BLE connection errors gracefully
- Test with physical devices for BLE features

### Common BLE Commands
- Get Device Info (0x02)
- Add Event/Alarm (0x04)
- Get All Events (0x06)
- Set Time (0x0B)
- Battery Status Notify (0x80)

Refer to `apps/expo/BLE_protocol.md` for complete protocol specification.

## Monorepo Management

### Adding Dependencies
```bash
# Add to workspace root
pnpm add <package> -w

# Add to specific app/package
pnpm add <package> --filter @gently/expo
pnpm add <package> --filter @gently/nextjs

# Add workspace dependency
# In package.json: "@gently/db": "workspace:*"
```

### Creating New Packages
```bash
pnpm turbo gen init
```

### Workspace Linting
```bash
pnpm lint:ws  # Check workspace consistency
```

## Environment Setup

### Required Environment Variables
- `POSTGRES_URL` - Database connection (use Docker for development: `postgresql://gently:gently@localhost:5832/gently`)
  - **Note**: The default credentials (`gently:gently`) are for local development only. Production environments MUST use secure, unique credentials.
- `AUTH_SECRET` - Authentication secret (generate with: `openssl rand -base64 32`)
- `NEXT_PUBLIC_BASE_URL` - Next.js app URL
- `EXPO_PUBLIC_BASE_URL` - API endpoint for Expo app (use local IP for physical devices)

### Optional OAuth Variables
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` - Google OAuth
- `APPLE_CLIENT_ID`, `APPLE_CLIENT_SECRET` - Apple Sign In

### Development with Docker
```bash
docker-compose up -d  # Start PostgreSQL and MailHog
# MailHog UI: http://localhost:8025 (for testing emails)
# PostgreSQL: localhost:5832
```

## Contributing Workflow

1. Create feature branch: `git checkout -b feature/your-feature`
2. Make changes following code style guidelines
3. Run quality checks: `pnpm typecheck && pnpm lint && pnpm format`
4. Test thoroughly on relevant platforms
5. Commit with clear message
6. Push and create pull request

## Common Tasks

### Adding UI Components
```bash
pnpm ui-add  # Add shadcn/ui components
```

### Database Changes
```bash
# 1. Modify schema in packages/db/src/schema
# 2. Push changes
pnpm db:push
# 3. Verify in Drizzle Studio
pnpm db:studio
```

### Fixing Type Errors
```bash
pnpm typecheck  # Find all type errors
# Fix errors in source files
# Re-run to verify
```

### Fixing Lint Issues
```bash
pnpm lint       # Check for issues
pnpm lint:fix   # Auto-fix when possible
```

## Troubleshooting

### BLE Issues
- Ensure Bluetooth is enabled on device
- Check device is in pairing mode
- Verify TEA encryption keys are synchronized
- Test with physical device, not just simulator

### Build Issues
- Clear caches: `pnpm clean:workspaces`
- Remove node_modules: `pnpm clean && pnpm install`
- Check Node.js version: `node --version` (should be >= 22.11.0)

### Database Issues
- Verify Docker is running: `docker ps`
- Check connection string in `.env`
- Reset database: `docker-compose down -v && docker-compose up -d && pnpm db:push`

### Expo Issues
- Clear Metro bundler cache: `cd apps/expo && pnpm expo start --clear`
- For physical devices, use local IP in `EXPO_PUBLIC_BASE_URL` (not localhost)

## Important Notes

- This is a monorepo - changes may affect multiple packages
- Always test on both iOS and Android when modifying mobile app
- BLE features require physical device testing (simulators have limited BLE support)
- Apple App Review test mode is available - see README.md for secure test credentials (not documented here for security)
- MailHog captures all emails in development (http://localhost:8025)
- Production deployments use Vercel for Next.js and EAS for Expo

## Resources

- Project README: `/README.md`
- BLE Protocol: `/apps/expo/BLE_protocol.md`
- Responsive Design: `/apps/expo/RESPONSIVE_DESIGN.md`
- Better-Auth Docs: https://www.better-auth.com
- Expo Docs: https://docs.expo.dev
- Drizzle ORM: https://orm.drizzle.team
