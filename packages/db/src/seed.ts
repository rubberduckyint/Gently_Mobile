/**
 * Database Seeding Script for Gently App
 *
 * This script generates realistic test data using Faker.js for:
 * - Users with profiles, emails, and admin status
 * - Devices with sync status, battery levels, and descriptions
 * - Alarms with schedules, colors, priorities, and haptic feedback
 *
 * Configuration can be modified in SEED_CONFIG below.
 *
 * Usage:
 *   pnpm seed      - Full seed with configurable amounts
 *   pnpm seed:quick - Quick seed with minimal data for testing
 *
 * ⚠️  WARNING: This script clears existing data by default!
 */

import { faker } from "@faker-js/faker";

import { db } from "./client";
import { Alarm, Device, user } from "./schema";

// Configuration for seed data
const SEED_CONFIG = {
  users: 10,
  devicesPerUser: 2, // 1-3 devices per user
  alarmsPerDevice: 5, // 2-8 alarms per device
};

// Helper function to generate a random number between min and max (inclusive)
function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Helper function to generate cron expressions for alarms
function generateCronExpression(): string {
  const patterns = [
    "0 7 * * *", // Daily at 7 AM
    "0 8 * * 1-5", // Weekdays at 8 AM
    "0 22 * * *", // Daily at 10 PM
    "30 6 * * *", // Daily at 6:30 AM
    "0 12 * * 0", // Sunday at noon
    "0 9 * * 6", // Saturday at 9 AM
    "15 20 * * *", // Daily at 8:15 PM
    "45 5 * * 1-5", // Weekdays at 5:45 AM
  ];
  return faker.helpers.arrayElement(patterns);
}

// Helper function to generate realistic device titles
function generateDeviceTitle(): string {
  const types = ["Bedroom", "Living Room", "Office", "Kitchen", "Bathroom"];
  const descriptors = ["Smart", "Gentle", "Wake-up", "Vibration", "Sleep"];
  const devices = ["Alarm", "Device", "Clock", "Assistant", "Hub"];

  return `${faker.helpers.arrayElement(types)} ${faker.helpers.arrayElement(descriptors)} ${faker.helpers.arrayElement(devices)}`;
}

// Helper function to generate realistic alarm titles
function generateAlarmTitle(): string {
  const times = ["Morning", "Evening", "Night", "Dawn", "Sunset"];
  const purposes = [
    "Wake Up",
    "Medication",
    "Meeting",
    "Exercise",
    "Break",
    "Reminder",
    "Coffee",
    "Workout",
    "Meditation",
    "Study Session",
  ];

  const shouldUsePurpose = faker.datatype.boolean(0.7);

  if (shouldUsePurpose) {
    return faker.helpers.arrayElement(purposes);
  } else {
    return `${faker.helpers.arrayElement(times)} ${faker.helpers.arrayElement(purposes)}`;
  }
}

// Helper function to generate colors
function generateColor(): string {
  const colors = [
    "#FF6B6B", // Red
    "#4ECDC4", // Teal
    "#45B7D1", // Blue
    "#96CEB4", // Green
    "#FECA57", // Yellow
    "#FF9FF3", // Pink
    "#A8E6CF", // Light green
    "#DDA0DD", // Plum
    "#98D8C8", // Mint
    "#FFA07A", // Light salmon
  ];
  return faker.helpers.arrayElement(colors);
}

async function seedUsers() {
  console.log("🌱 Seeding users...");

  const users = [];

  // First, add the specific admin user
  const adminUser = {
    id: faker.string.uuid(),
    name: "Oliver Lett",
    email: "ollett@gmail.com",
    emailVerified: true,
    image: faker.image.avatar(),
    isAdmin: true,
    createdAt: faker.date.between({
      from: new Date("2023-01-01"),
      to: new Date(),
    }),
    updatedAt: new Date(),
  };

  users.push(adminUser);

  // Then add the remaining random users
  for (let i = 1; i < SEED_CONFIG.users; i++) {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    const email = faker.internet.email({ firstName, lastName }).toLowerCase();

    const newUser = {
      id: faker.string.uuid(),
      name: `${firstName} ${lastName}`,
      email,
      emailVerified: faker.datatype.boolean(0.8), // 80% verified
      image: faker.datatype.boolean(0.6) ? faker.image.avatar() : null, // 60% have profile images
      isAdmin: faker.datatype.boolean(0.1), // 10% are admins
      createdAt: faker.date.between({
        from: new Date("2023-01-01"),
        to: new Date(),
      }),
      updatedAt: new Date(),
    };

    users.push(newUser);
  }

  await db.insert(user).values(users);
  console.log(`✅ Created ${users.length} users`);

  return users;
}

async function seedDevices(users: { id: string; name: string }[]) {
  console.log("🖥️ Seeding devices...");

  const devices = [];

  for (const currentUser of users) {
    const deviceCount = randomBetween(1, SEED_CONFIG.devicesPerUser);

    for (let i = 0; i < deviceCount; i++) {
      const createdAt = faker.date.between({
        from: new Date("2023-01-01"),
        to: new Date(),
      });

      const device = {
        title: generateDeviceTitle(),
        description: faker.lorem.sentence({ min: 5, max: 15 }),
        createdAt,
        updatedAt: faker.date.between({ from: createdAt, to: new Date() }),
        syncStatus: faker.helpers.arrayElement([
          "NOT_SYNCED",
          "SYNCING",
          "SYNCED",
          "ERROR",
        ] as const),
        batteryLevel: randomBetween(10, 100),
        lastSync: faker.datatype.boolean(0.8)
          ? faker.date.between({ from: createdAt, to: new Date() })
          : null,
        userId: currentUser.id,
      };

      devices.push(device);
    }
  }

  const insertedDevices = await db.insert(Device).values(devices).returning();
  console.log(`✅ Created ${insertedDevices.length} devices`);

  return insertedDevices;
}

async function seedAlarms(
  users: { id: string; name: string }[],
  devices: { id: string; userId: string; title: string }[],
) {
  console.log("⏰ Seeding alarms...");

  const alarms = [];

  for (const device of devices) {
    const alarmCount = randomBetween(2, SEED_CONFIG.alarmsPerDevice);

    for (let i = 0; i < alarmCount; i++) {
      const createdAt = faker.date.between({
        from: new Date("2023-01-01"),
        to: new Date(),
      });

      const startDate = faker.date.future({ years: 1 });
      const hasEndDate = faker.datatype.boolean(0.3); // 30% have end dates
      const isRepeating = faker.datatype.boolean(0.7); // 70% are repeating

      const alarm = {
        title: generateAlarmTitle(),
        description: faker.datatype.boolean(0.6)
          ? faker.lorem.sentence({ min: 3, max: 10 })
          : null,
        isActive: faker.datatype.boolean(0.8), // 80% are active
        startDate,
        endDate: hasEndDate
          ? faker.date.future({ years: 2, refDate: startDate })
          : null,
        repeat: isRepeating,
        cronExpression: generateCronExpression(),
        createdAt,
        updatedAt: faker.date.between({ from: createdAt, to: new Date() }),
        color: generateColor(),
        syncStatus: faker.helpers.arrayElement([
          "NOT_SYNCED",
          "SYNCING",
          "SYNCED",
          "ERROR",
        ] as const),
        priority: faker.helpers.arrayElement([
          "LOW",
          "MEDIUM",
          "HIGH",
        ] as const),
        hapticChoice: faker.helpers.arrayElement([
          "STANDARD",
          "STRONG",
          "SOFT",
          "DOUBLE",
          "PULSE",
          "WAVE",
        ] as const),
        lastSync: faker.datatype.boolean(0.7)
          ? faker.date.between({ from: createdAt, to: new Date() })
          : null,
        userId: device.userId,
        deviceId: device.id,
      };

      alarms.push(alarm);
    }
  }

  await db.insert(Alarm).values(alarms);
  console.log(`✅ Created ${alarms.length} alarms`);

  return alarms;
}

async function main() {
  try {
    console.log("🚀 Starting database seeding...");
    console.log(`📊 Configuration:
    - Users: ${SEED_CONFIG.users}
    - Devices per user: 1-${SEED_CONFIG.devicesPerUser}
    - Alarms per device: 2-${SEED_CONFIG.alarmsPerDevice}
    `);

    // Clear existing data (optional - comment out if you want to keep existing data)
    console.log("🗑️ Clearing existing data...");
    await db.delete(Alarm);
    await db.delete(Device);
    await db.delete(user);
    console.log("✅ Cleared existing data");

    // Seed data in order (users first, then devices, then alarms)
    const users = await seedUsers();
    const devices = await seedDevices(users);
    const alarms = await seedAlarms(users, devices);

    console.log("🎉 Database seeding completed successfully!");
    console.log(`📈 Summary:
    - Users created: ${users.length}
    - Devices created: ${devices.length}
    - Alarms created: ${alarms.length}
    `);
  } catch (error) {
    console.error("❌ Error seeding database:", error);
    process.exit(1);
  }
}

// Run the seed function
if (import.meta.url === new URL(process.argv[1] ?? "", "file://").href) {
  main()
    .then(() => {
      console.log("✨ Seeding process finished");
      process.exit(0);
    })
    .catch((error) => {
      console.error("💥 Seeding failed:", error);
      process.exit(1);
    });
}

export { main as seed };
