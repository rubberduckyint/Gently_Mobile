import { faker } from "@faker-js/faker";

import { db } from "./client";
import { Alarm, Device, user } from "./schema";

// Minimal configuration for quick testing
const QUICK_SEED_CONFIG = {
  users: 3,
  devicesPerUser: 1,
  alarmsPerDevice: 2,
};

// Helper functions (simplified versions from main seed)
function generateCronExpression(): string {
  const patterns = [
    "0 7 * * *", // Daily at 7 AM
    "0 8 * * 1-5", // Weekdays at 8 AM
    "0 22 * * *", // Daily at 10 PM
  ];
  return faker.helpers.arrayElement(patterns);
}

function generateDeviceTitle(): string {
  const types = ["Bedroom", "Living Room", "Office"];
  const devices = ["Alarm", "Device", "Clock"];

  return `${faker.helpers.arrayElement(types)} ${faker.helpers.arrayElement(devices)}`;
}

function generateAlarmTitle(): string {
  const purposes = ["Wake Up", "Medication", "Meeting", "Exercise"];
  return faker.helpers.arrayElement(purposes);
}

function generateColor(): string {
  const colors = ["#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FECA57"];
  return faker.helpers.arrayElement(colors);
}

async function quickSeed() {
  try {
    console.log("🚀 Quick seeding started...");

    // Clear existing data
    await db.delete(Alarm);
    await db.delete(Device);
    await db.delete(user);

    // Create users
    const users = [];
    for (let i = 0; i < QUICK_SEED_CONFIG.users; i++) {
      users.push({
        id: faker.string.uuid(),
        name: faker.person.fullName(),
        email: faker.internet.email().toLowerCase(),
        emailVerified: true,
        image: faker.image.avatar(),
        isAdmin: i === 0, // First user is admin
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    await db.insert(user).values(users);
    console.log(`✅ Created ${users.length} users`);

    // Create devices
    const devices = [];
    for (const currentUser of users) {
      devices.push({
        title: generateDeviceTitle(),
        description: faker.lorem.sentence(),
        createdAt: new Date(),
        updatedAt: new Date(),
        syncStatus: "SYNCED" as const,
        batteryLevel: faker.number.int({ min: 50, max: 100 }),
        lastSync: new Date(),
        userId: currentUser.id,
      });
    }

    const insertedDevices = await db.insert(Device).values(devices).returning();
    console.log(`✅ Created ${insertedDevices.length} devices`);

    // Create alarms
    const alarms = [];
    for (const device of insertedDevices) {
      for (let i = 0; i < QUICK_SEED_CONFIG.alarmsPerDevice; i++) {
        alarms.push({
          title: generateAlarmTitle(),
          description: faker.lorem.sentence(),
          isActive: true,
          startDate: faker.date.future(),
          endDate: null,
          repeat: true,
          cronExpression: generateCronExpression(),
          createdAt: new Date(),
          updatedAt: new Date(),
          color: generateColor(),
          syncStatus: "SYNCED" as const,
          priority: "MEDIUM" as const,
          hapticChoice: "STANDARD" as const,
          lastSync: new Date(),
          userId: device.userId,
          deviceId: device.id,
        });
      }
    }

    await db.insert(Alarm).values(alarms);
    console.log(`✅ Created ${alarms.length} alarms`);

    console.log("🎉 Quick seeding completed!");
    console.log(
      `📈 Summary: ${users.length} users, ${devices.length} devices, ${alarms.length} alarms`,
    );
  } catch (error) {
    console.error("❌ Error in quick seeding:", error);
    process.exit(1);
  }
}

// Run the quick seed function
if (import.meta.url === new URL(process.argv[1] ?? "", "file://").href) {
  quickSeed()
    .then(() => {
      console.log("✨ Quick seeding finished");
      process.exit(0);
    })
    .catch((error) => {
      console.error("💥 Quick seeding failed:", error);
      process.exit(1);
    });
}

export { quickSeed };
