/**
 * BLE Context Provider
 *
 * Global BLE connection management with automatic reconnection,
 * connection state tracking, and shared access across the app.
 *
 * Features:
 * - Maintains persistent connection to a single device
 * - Automatic reconnection when connection is lost
 * - Global connection state management
 * - Shared BLE operations without re-connecting
 * - Connection status monitoring
 * - Error handling and retry logic
 */

import type { AppStateStatus } from "react-native";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppState } from "react-native";

import type { ConnectionState, DiscoveredGentlyDevice } from "~/services/ble";
import {
  connectBySerialNumber,
  disconnectDevice,
  getConnectionState,
  requestBlePermissions,
  scanForGentlyDevices,
} from "~/services/ble";

export interface BLEContextState {
  // Connection state
  connectionState: ConnectionState;
  isConnecting: boolean;
  connectionError: string | null;

  // Current device
  currentDevice: {
    serialNumber: string;
    deviceId?: string;
    deviceInfo?: unknown;
  } | null;

  // Scanning
  isScanning: boolean;
  discoveredDevices: DiscoveredGentlyDevice[];

  // Connection management
  connect: (serialNumber: string) => Promise<void>;
  disconnect: () => Promise<void>;
  reconnect: () => Promise<void>;

  // Scanning
  startScan: (timeoutMs?: number) => Promise<DiscoveredGentlyDevice[]>;
  stopScan: () => void;

  // Utilities
  isConnectedTo: (serialNumber: string) => boolean;
  refreshConnectionState: () => Promise<ConnectionState>;
}

const BLEContext = createContext<BLEContextState | null>(null);

export interface BLEProviderProps {
  children: React.ReactNode;
  autoReconnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

export function BLEProvider({
  children,
  autoReconnect = true,
  reconnectInterval = 5000, // 5 seconds
  maxReconnectAttempts = 3,
}: BLEProviderProps) {
  // Connection state
  const [connectionState, setConnectionState] = useState<ConnectionState>({
    isConnected: false,
    hasCustomKey: false,
  });
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // Current device
  const [currentDevice, setCurrentDevice] = useState<{
    serialNumber: string;
    deviceId?: string;
    deviceInfo?: unknown;
  } | null>(null);

  // Scanning state
  const [isScanning, setIsScanning] = useState(false);
  const [discoveredDevices, setDiscoveredDevices] = useState<
    DiscoveredGentlyDevice[]
  >([]);

  // Reconnection logic
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const connectInFlightRef = useRef<Promise<void> | null>(null);
  const connectSerialRef = useRef<string | null>(null);

  /**
   * Clear any pending reconnection attempts
   */
  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  /**
   * Internal connection function
   */
  const performConnection = useCallback(
    async (serialNumber: string) => {
      setIsConnecting(true);
      setConnectionError(null);

      try {
        console.log(`📱 Connecting to device: ${serialNumber}`);

        // Request BLE permissions first
        await requestBlePermissions();

        // Connect to device
        const deviceInfo = await connectBySerialNumber(serialNumber);

        // Get connection state
        const state = await getConnectionState(serialNumber);

        // Update state
        setCurrentDevice({
          serialNumber,
          deviceId: state.deviceId,
          deviceInfo,
        });
        setConnectionState(state);

        // Reset reconnect attempts on successful connection
        reconnectAttemptsRef.current = 0;
        clearReconnectTimeout();

        console.log(`✅ Successfully connected to device: ${serialNumber}`);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown connection error";
        console.error(
          `❌ Connection failed for ${serialNumber}:`,
          errorMessage,
        );
        setConnectionError(errorMessage);
        throw error;
      } finally {
        setIsConnecting(false);
      }
    },
    [clearReconnectTimeout],
  );

  const connectToDevice = useCallback(
    async (serialNumber: string) => {
      if (
        connectSerialRef.current === serialNumber &&
        connectInFlightRef.current
      ) {
        return connectInFlightRef.current;
      }

      if (connectInFlightRef.current) {
        try {
          await connectInFlightRef.current;
        } catch (error) {
          console.warn("Previous connection attempt failed:", error);
        }
      }

      connectSerialRef.current = serialNumber;
      const promise = performConnection(serialNumber)
        .catch((error) => {
          throw error;
        })
        .finally(() => {
          connectInFlightRef.current = null;
          connectSerialRef.current = null;
        });

      connectInFlightRef.current = promise;
      return promise;
    },
    [performConnection],
  );

  /**
   * Schedule a reconnection attempt
   */
  const scheduleReconnect = useCallback(() => {
    if (
      !currentDevice?.serialNumber ||
      reconnectAttemptsRef.current >= maxReconnectAttempts
    ) {
      return;
    }

    clearReconnectTimeout();

    reconnectTimeoutRef.current = setTimeout(() => {
      void (async () => {
        try {
          console.log(
            `🔄 Auto-reconnect attempt ${reconnectAttemptsRef.current + 1}/${maxReconnectAttempts}`,
          );
          await connectToDevice(currentDevice.serialNumber);
        } catch (error) {
          console.error("Auto-reconnect failed:", error);
          reconnectAttemptsRef.current += 1;

          if (reconnectAttemptsRef.current < maxReconnectAttempts) {
            scheduleReconnect();
          } else {
            console.log("❌ Max reconnect attempts reached");
            setConnectionError("Failed to reconnect after multiple attempts");
          }
        }
      })();
    }, reconnectInterval);
  }, [
    currentDevice?.serialNumber,
    maxReconnectAttempts,
    reconnectInterval,
    clearReconnectTimeout,
    connectToDevice,
  ]);

  /**
   * Refresh the current connection state
   */
  const refreshConnectionState =
    useCallback(async (): Promise<ConnectionState> => {
      if (!currentDevice?.serialNumber) {
        const defaultState: ConnectionState = {
          isConnected: false,
          hasCustomKey: false,
        };
        setConnectionState(defaultState);
        return defaultState;
      }

      try {
        const state = await getConnectionState(currentDevice.serialNumber);
        setConnectionState(state);

        // If we lost connection and auto-reconnect is enabled, schedule reconnection
        if (
          !state.isConnected &&
          autoReconnect &&
          appStateRef.current === "active"
        ) {
          scheduleReconnect();
        }

        return state;
      } catch (error) {
        console.error("Failed to refresh connection state:", error);
        const fallbackState: ConnectionState = {
          isConnected: false,
          hasCustomKey: false,
        };
        setConnectionState(fallbackState);

        if (autoReconnect && appStateRef.current === "active") {
          scheduleReconnect();
        }

        return fallbackState;
      }
    }, [currentDevice?.serialNumber, autoReconnect, scheduleReconnect]);

  /**
   * Disconnect from current device
   */
  const disconnect = useCallback(async () => {
    clearReconnectTimeout();

    if (currentDevice?.serialNumber) {
      try {
        console.log(
          `📱 Disconnecting from device: ${currentDevice.serialNumber}`,
        );
        await disconnectDevice(currentDevice.serialNumber);
        console.log(
          `✅ Successfully disconnected from device: ${currentDevice.serialNumber}`,
        );
      } catch (error) {
        console.error("Disconnect error:", error);
        // Continue with cleanup even if disconnect fails
      }
    }

    // Reset state
    setCurrentDevice(null);
    setConnectionState({ isConnected: false, hasCustomKey: false });
    setConnectionError(null);
    reconnectAttemptsRef.current = 0;
  }, [currentDevice, clearReconnectTimeout]);

  /**
   * Connect to a device
   */
  const connect = useCallback(
    async (serialNumber: string) => {
      // If already connected to this device, just refresh state
      if (
        currentDevice?.serialNumber === serialNumber &&
        connectionState.isConnected
      ) {
        const refreshedState = await refreshConnectionState();
        if (refreshedState.isConnected) {
          return;
        }
      }

      // Disconnect from current device if different
      if (currentDevice && currentDevice.serialNumber !== serialNumber) {
        await disconnect();
      }

      await connectToDevice(serialNumber);
    },
    [
      currentDevice,
      connectionState.isConnected,
      refreshConnectionState,
      disconnect,
      connectToDevice,
    ],
  );

  /**
   * Manually trigger reconnection
   */
  const reconnect = useCallback(async () => {
    if (!currentDevice?.serialNumber) {
      throw new Error("No device to reconnect to");
    }

    // Reset reconnect attempts for manual reconnection
    reconnectAttemptsRef.current = 0;
    clearReconnectTimeout();

    await connectToDevice(currentDevice.serialNumber);
  }, [currentDevice, clearReconnectTimeout, connectToDevice]);

  /**
   * Start BLE device scanning
   */
  const startScan = useCallback(
    async (timeoutMs = 10000): Promise<DiscoveredGentlyDevice[]> => {
      setIsScanning(true);
      setDiscoveredDevices([]);

      try {
        await requestBlePermissions();
        const devices = await scanForGentlyDevices({ timeoutMs });
        setDiscoveredDevices(devices);
        return devices;
      } catch (error) {
        console.error("Scan failed:", error);
        throw error;
      } finally {
        setIsScanning(false);
      }
    },
    [],
  );

  /**
   * Stop BLE scanning
   */
  const stopScan = useCallback(() => {
    setIsScanning(false);
    setDiscoveredDevices([]);
    // Note: The actual BLE scan stop is handled by the scanner module
  }, []);

  /**
   * Check if connected to a specific device
   */
  const isConnectedTo = useCallback(
    (serialNumber: string): boolean => {
      return (
        currentDevice?.serialNumber === serialNumber &&
        connectionState.isConnected
      );
    },
    [currentDevice, connectionState],
  );

  /**
   * Monitor app state changes
   */
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      appStateRef.current = nextAppState;

      if (nextAppState === "active" && currentDevice) {
        // App came to foreground, refresh connection state
        void refreshConnectionState();
      } else if (nextAppState === "background" || nextAppState === "inactive") {
        // App went to background, clear reconnect timeout
        clearReconnectTimeout();
      }
    };

    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange,
    );

    return () => {
      subscription.remove();
    };
  }, [currentDevice, refreshConnectionState, clearReconnectTimeout]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      clearReconnectTimeout();
    };
  }, [clearReconnectTimeout]);

  const contextValue: BLEContextState = {
    // Connection state
    connectionState,
    isConnecting,
    connectionError,

    // Current device
    currentDevice,

    // Scanning
    isScanning,
    discoveredDevices,

    // Connection management
    connect,
    disconnect,
    reconnect,

    // Scanning
    startScan,
    stopScan,

    // Utilities
    isConnectedTo,
    refreshConnectionState,
  };

  return (
    <BLEContext.Provider value={contextValue}>{children}</BLEContext.Provider>
  );
}

/**
 * Hook to use BLE context
 */
export function useBLE(): BLEContextState {
  const context = useContext(BLEContext);

  if (!context) {
    throw new Error("useBLE must be used within a BLEProvider");
  }

  return context;
}

/**
 * Hook to get connection status for a specific device
 */
export function useBLEConnection(serialNumber?: string) {
  const ble = useBLE();

  const isConnected = serialNumber
    ? ble.isConnectedTo(serialNumber)
    : ble.connectionState.isConnected;
  const isCurrentDevice = ble.currentDevice?.serialNumber === serialNumber;

  return {
    isConnected,
    isCurrentDevice,
    isConnecting: ble.isConnecting,
    connectionError: ble.connectionError,
    connectionState: ble.connectionState,
    connect: () =>
      serialNumber
        ? ble.connect(serialNumber)
        : Promise.reject(new Error("No serial number provided")),
    disconnect: ble.disconnect,
    reconnect: ble.reconnect,
  };
}

/**
 * Hook for BLE device scanning
 */
export function useBLEScanning() {
  const ble = useBLE();

  return {
    isScanning: ble.isScanning,
    discoveredDevices: ble.discoveredDevices,
    startScan: ble.startScan,
    stopScan: ble.stopScan,
  };
}
