# Database Seeding

This package includes a comprehensive seeding script that generates realistic test data for the Gently application using Faker.js.

## What gets seeded

The seed script creates:

- **Users**: Realistic user profiles with names, emails, profile images, and admin status
- **Devices**: Smart alarm devices with titles, descriptions, sync status, and battery levels
- **Alarms**: Wake-up alarms with titles, schedules, colors, priorities, and haptic feedback settings

## Configuration

You can modify the seeding configuration in `src/seed.ts`:

```typescript
const SEED_CONFIG = {
  users: 10, // Number of users to create
  devicesPerUser: 2, // Max devices per user (random 1-2)
  alarmsPerDevice: 5, // Max alarms per device (random 2-5)
};
```

## Running the seed script

### Prerequisites

1. Make sure your database is set up and the connection string is configured in your `.env` file
2. Run any pending migrations: `pnpm push`

### Execute seeding

```bash
# Full seed (10 users, ~20 devices, ~100 alarms)
pnpm seed

# Quick seed (3 users, 3 devices, 6 alarms) - for rapid testing
pnpm seed:quick

# Or from the project root
pnpm --filter @gently/db seed
pnpm --filter @gently/db seed:quick
```

The quick seed option is perfect for rapid development and testing with minimal data.

## Generated data details

### Users

- Realistic first and last names
- Email addresses based on names
- Random profile image URLs (60% of users)
- Admin status (10% chance)
- Email verification status (80% verified)
- Created dates between Jan 1, 2023 and now

### Devices

- Creative device titles (e.g., "Bedroom Smart Alarm", "Office Wake-up Hub")
- Descriptive descriptions
- Random sync status (NOT_SYNCED, SYNCING, SYNCED, ERROR)
- Battery levels between 10-100%
- Last sync timestamps (80% have synced before)

### Alarms

- Realistic alarm titles (e.g., "Morning Wake Up", "Medication", "Meeting")
- Optional descriptions (60% have descriptions)
- Various cron expressions for different schedules:
  - Daily at 7 AM: `0 7 * * *`
  - Weekdays at 8 AM: `0 8 * * 1-5`
  - Daily at 10 PM: `0 22 * * *`
  - And more patterns...
- Color-coded alarms with pleasant colors
- Priority levels (LOW, MEDIUM, HIGH)
- Haptic feedback patterns (STANDARD, STRONG, SOFT, DOUBLE, PULSE, WAVE)
- Active status (80% are active)
- Repeat settings (70% are repeating)
- Optional end dates (30% have end dates)

## Data clearing

⚠️ **Warning**: The seed script will clear all existing data by default. If you want to preserve existing data, comment out these lines in `src/seed.ts`:

```typescript
// await db.delete(Alarm);
// await db.delete(Device);
// await db.delete(user);
```

## Using in development

This seed data is perfect for:

- Testing the UI with realistic data
- Demonstrating the application features
- Performance testing with a substantial dataset
- Development and debugging

The generated data follows the application's business rules and provides a variety of scenarios to test different features of the Gently alarm system.
