/**
 * BLE Command Registry
 *
 * Central registry for all BLE commands, providing:
 * - Command discovery and instantiation
 * - Command execution with context management
 * - Type-safe command access
 * - Command filtering and categorization
 */

import type { SecureConnectionResult } from "../connection";
import type {
  BLECommand,
  BLECommandExecutionContext,
  BLECommandMetadata,
  BLECommandResult,
} from "./base";
import { ActiveEventNotifyCommand } from "./ActiveEventNotifyCommand";
import { BatteryStatusNotifyCommand } from "./BatteryStatusNotifyCommand";
// Import all command classes for auto-registration
import { CreateEventCommand } from "./CreateEventCommand";
import { DeviceInfoCommand } from "./DeviceInfoCommand";
import { EnterDFUModeCommand } from "./EnterDFUModeCommand";
import { FindMeCommand } from "./FindMeCommand";
import { GetAllEventsCommand } from "./GetAllEventsCommand";
import { GetDeviceStatusCommand } from "./GetDeviceStatusCommand";
import { GetNumberOfEventsCommand } from "./GetNumberOfEventsCommand";
import { GetTimeCommand } from "./GetTimeCommand";
import { GetUptimeCommand } from "./GetUptimeCommand";
import { RebootDeviceCommand } from "./RebootDeviceCommand";
import { RemoveAllEventsCommand } from "./RemoveAllEventsCommand";
import { SetTimeCommand } from "./SetTimeCommand";
import { TimeNotifyCommand } from "./TimeNotifyCommand";

/**
 * Constructor type for BLE commands
 */
type BLECommandConstructor<T = unknown> = new () => BLECommand<T>;

/**
 * Registry entry for a BLE command
 */
interface BLECommandRegistryEntry<T = unknown> {
  constructor: BLECommandConstructor<T>;
  instance: BLECommand<T>;
  metadata: BLECommandMetadata;
}

/**
 * Filter options for finding commands
 */
export interface CommandFilter {
  category?: BLECommandMetadata["category"];
  tags?: string[];
  requiresConnection?: boolean;
  id?: string;
}

/**
 * Context for executing commands via the registry
 */
export interface RegistryExecutionContext {
  deviceSerialNumber: string;
  connection?: SecureConnectionResult;
  connect: () => Promise<SecureConnectionResult>;
  disconnect: () => Promise<void>;
  parameters?: Record<string, unknown>;
  options?: {
    timeout?: number;
    captureConsoleLogs?: boolean;
    logLevel?: "debug" | "info" | "warn" | "error";
  };
}

/**
 * Central registry for all BLE commands
 */
export class BLECommandRegistry {
  private readonly commands = new Map<string, BLECommandRegistryEntry>();

  /**
   * Register a command class
   */
  public register<T>(CommandClass: BLECommandConstructor<T>): void {
    const instance = new CommandClass();
    const metadata = instance.metadata;

    if (this.commands.has(metadata.id)) {
      console.warn(
        `Command ${metadata.id} is already registered. Overwriting...`,
      );
    }

    this.commands.set(metadata.id, {
      constructor: CommandClass,
      instance,
      metadata,
    });
  }

  /**
   * Get all registered commands
   */
  public getAllCommands(): BLECommandMetadata[] {
    return Array.from(this.commands.values()).map((entry) => entry.metadata);
  }

  /**
   * Get commands matching filter criteria
   */
  public getCommands(filter: CommandFilter = {}): BLECommandMetadata[] {
    const allCommands = this.getAllCommands();

    return allCommands.filter((metadata) => {
      // Filter by category
      if (filter.category && metadata.category !== filter.category) {
        return false;
      }

      // Filter by tags (command must have ALL specified tags)
      if (filter.tags && filter.tags.length > 0) {
        const hasAllTags = filter.tags.every((tag) =>
          metadata.tags.includes(tag),
        );
        if (!hasAllTags) {
          return false;
        }
      }

      // Filter by connection requirement
      if (
        filter.requiresConnection !== undefined &&
        metadata.requiresConnection !== filter.requiresConnection
      ) {
        return false;
      }

      // Filter by ID
      if (filter.id && metadata.id !== filter.id) {
        return false;
      }

      return true;
    });
  }

  /**
   * Get command by ID
   */
  public getCommand(id: string): BLECommandMetadata | undefined {
    const entry = this.commands.get(id);
    return entry?.metadata;
  }

  /**
   * Check if command exists
   */
  public hasCommand(id: string): boolean {
    return this.commands.has(id);
  }

  /**
   * Execute a command by ID
   */
  public async executeCommand<T = unknown>(
    commandId: string,
    context: RegistryExecutionContext,
  ): Promise<BLECommandResult<T>> {
    const entry = this.commands.get(commandId);
    if (!entry) {
      throw new Error(`Command '${commandId}' not found in registry`);
    }

    // Convert registry context to command execution context
    const executionContext: BLECommandExecutionContext = {
      deviceSerialNumber: context.deviceSerialNumber,
      connection: context.connection,
      connect: context.connect,
      disconnect: context.disconnect,
      parameters: context.parameters,
      options: context.options,
    };

    // Create a new instance for execution to avoid state pollution
    const commandInstance = new entry.constructor();
    return (await commandInstance.execute(
      executionContext,
    )) as BLECommandResult<T>;
  }

  /**
   * Get commands grouped by category
   */
  public getCommandsByCategory(): Record<string, BLECommandMetadata[]> {
    const allCommands = this.getAllCommands();
    const grouped: Record<string, BLECommandMetadata[]> = {};

    for (const command of allCommands) {
      grouped[command.category] ??= [];
      const categoryCommands = grouped[command.category];
      if (categoryCommands) {
        categoryCommands.push(command);
      }
    }

    return grouped;
  }

  /**
   * Get command categories
   */
  public getCategories(): string[] {
    const categories = new Set<string>();

    for (const metadata of this.getAllCommands()) {
      categories.add(metadata.category);
    }

    return Array.from(categories).sort();
  }

  /**
   * Get all tags used by commands
   */
  public getAllTags(): string[] {
    const tags = new Set<string>();

    for (const metadata of this.getAllCommands()) {
      for (const tag of metadata.tags) {
        tags.add(tag);
      }
    }

    return Array.from(tags).sort();
  }

  /**
   * Clear all registered commands
   */
  public clear(): void {
    this.commands.clear();
  }

  /**
   * Get registry statistics
   */
  public getStats(): {
    totalCommands: number;
    categories: number;
    tags: number;
    commandsRequiringConnection: number;
    commandsNotRequiringConnection: number;
  } {
    const allCommands = this.getAllCommands();

    return {
      totalCommands: allCommands.length,
      categories: this.getCategories().length,
      tags: this.getAllTags().length,
      commandsRequiringConnection: allCommands.filter(
        (cmd) => cmd.requiresConnection,
      ).length,
      commandsNotRequiringConnection: allCommands.filter(
        (cmd) => !cmd.requiresConnection,
      ).length,
    };
  }
}

// Global registry instance
let globalRegistry: BLECommandRegistry | undefined;

/**
 * Get the global BLE command registry instance
 */
export function getBLECommandRegistry(): BLECommandRegistry {
  if (!globalRegistry) {
    globalRegistry = new BLECommandRegistry();
    // Auto-register commands when first accessed
    registerBuiltInCommands();
  }
  return globalRegistry;
}

/**
 * Register all built-in commands
 * This will be expanded as we add more commands
 */
function registerBuiltInCommands(): void {
  // Register all commands synchronously
  try {
    if (!globalRegistry) return;

    // Register core connection and device info commands
    globalRegistry.register(DeviceInfoCommand);
    globalRegistry.register(FindMeCommand);

    // Register device status and time commands
    globalRegistry.register(GetUptimeCommand);
    globalRegistry.register(GetDeviceStatusCommand);
    globalRegistry.register(GetTimeCommand);
    globalRegistry.register(SetTimeCommand);

    // Register device control commands
    globalRegistry.register(RebootDeviceCommand);
    globalRegistry.register(EnterDFUModeCommand);

    // Register event management commands
    globalRegistry.register(GetAllEventsCommand);
    globalRegistry.register(GetNumberOfEventsCommand);
    globalRegistry.register(RemoveAllEventsCommand);
    globalRegistry.register(CreateEventCommand);

    // Register notification commands (async from device)
    globalRegistry.register(BatteryStatusNotifyCommand);
    globalRegistry.register(ActiveEventNotifyCommand);
    globalRegistry.register(TimeNotifyCommand);

    console.log(
      `✅ Registered ${globalRegistry.getStats().totalCommands} BLE commands`,
    );
    console.log(
      "🔧 BLE Command Registry initialized with all built-in commands",
    );
  } catch (error) {
    console.error("Failed to register built-in commands:", error);
  }
}

/**
 * Reset the global registry (mainly for testing)
 */
export function resetBLECommandRegistry(): void {
  globalRegistry = undefined;
}
