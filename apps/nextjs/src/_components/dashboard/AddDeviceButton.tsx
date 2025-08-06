"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Bluetooth, Loader2, Search, WifiOff } from "lucide-react";

import { Button } from "~/_components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/_components/ui/dialog";
import { useTRPC } from "~/trpc/react";

interface BluetoothDevice {
  id: string;
  name: string;
  rssi: number; // Signal strength
}

type ConnectionStep =
  | "scanning"
  | "found"
  | "connecting"
  | "connected"
  | "error";

export function AddDeviceButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<ConnectionStep>("scanning");
  const [foundDevices, setFoundDevices] = useState<BluetoothDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<BluetoothDevice | null>(
    null,
  );
  const [isScanning, setIsScanning] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const trpc = useTRPC();

  const createDeviceMutation = useMutation({
    ...trpc.device.create.mutationOptions({
      onSuccess: () => {
        setIsOpen(false);
        resetState();
        // Refetch devices list
        window.location.reload();
      },
      onError: (error) => {
        setStep("error");
        setErrorMessage(error.message || "Failed to create device");
      },
    }),
  });

  const resetState = () => {
    setStep("scanning");
    setFoundDevices([]);
    setSelectedDevice(null);
    setIsScanning(false);
    setIsConnecting(false);
    setErrorMessage("");
  };

  const handleStartScan = async () => {
    setIsScanning(true);
    setFoundDevices([]);
    setStep("scanning");

    // Check if Web Bluetooth is supported
    if (!("bluetooth" in navigator)) {
      setStep("error");
      setErrorMessage(
        "Bluetooth is not supported in your browser. Please use Chrome, Edge, or another supported browser.",
      );
      setIsScanning(false);
      return;
    }

    try {
      // Simulate scanning with a delay
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // For now, we'll simulate finding devices since Web Bluetooth requires user interaction
      // In a real implementation, you would use: navigator.bluetooth.requestDevice()
      const mockDevices: BluetoothDevice[] = [
        { id: "gently-001", name: "Gently", rssi: -45 },
        { id: "gently-002", name: "Gently", rssi: -65 },
        { id: "gently-003", name: "Gently", rssi: -78 },
      ];

      setFoundDevices(mockDevices);
      setStep("found");
    } catch {
      setStep("error");
      setErrorMessage(
        "Failed to scan for devices. Please make sure Bluetooth is enabled.",
      );
    } finally {
      setIsScanning(false);
    }
  };

  const handleDeviceSelect = (device: BluetoothDevice) => {
    setSelectedDevice(device);
  };

  const handleConnect = async () => {
    if (!selectedDevice) return;

    setIsConnecting(true);
    setStep("connecting");

    try {
      // Simulate connection process
      await new Promise((resolve) => setTimeout(resolve, 3000));

      setStep("connected");

      // Wait a moment to show success, then create the device
      setTimeout(() => {
        createDeviceMutation.mutate({
          title: `${selectedDevice.name} Device`,
          description: `Bluetooth device ${selectedDevice.id}`,
        });
      }, 1500);
    } catch {
      setStep("error");
      setErrorMessage("Failed to connect to device. Please try again.");
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDialogOpen = (open: boolean) => {
    setIsOpen(open);
    if (open) {
      void handleStartScan();
    } else {
      resetState();
    }
  };

  const getSignalStrength = (rssi: number) => {
    if (rssi > -50) return "Excellent";
    if (rssi > -60) return "Good";
    if (rssi > -70) return "Fair";
    return "Weak";
  };

  const getSignalColor = (rssi: number) => {
    if (rssi > -50) return "text-green-600";
    if (rssi > -60) return "text-blue-600";
    if (rssi > -70) return "text-yellow-600";
    return "text-red-600";
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleDialogOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Bluetooth className="h-4 w-4" />
          Add Device
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        {step === "scanning" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Search className="h-5 w-5" />
                Scanning for Devices
              </DialogTitle>
              <DialogDescription>
                Looking for nearby Gently devices...
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="relative">
                <Bluetooth className="h-12 w-12 text-blue-500" />
                {isScanning && (
                  <Loader2 className="absolute -top-2 -right-2 h-6 w-6 animate-spin text-blue-500" />
                )}
              </div>
              <p className="text-muted-foreground text-center text-sm">
                Make sure your Gently device is in pairing mode
              </p>
            </div>
          </>
        )}

        {step === "found" && (
          <>
            <DialogHeader>
              <DialogTitle>Found Devices</DialogTitle>
              <DialogDescription>
                Select a Gently device to connect
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-4">
              {foundDevices.map((device) => (
                <div
                  key={device.id}
                  className={`flex cursor-pointer items-center justify-between rounded-lg border p-3 transition-colors ${
                    selectedDevice?.id === device.id
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200 hover:bg-gray-50"
                  }`}
                  onClick={() => handleDeviceSelect(device)}
                >
                  <div className="flex items-center gap-3">
                    <Bluetooth className="h-5 w-5 text-blue-500" />
                    <div>
                      <p className="font-medium">{device.name}</p>
                      <p className="text-muted-foreground text-xs">
                        {device.id}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p
                      className={`text-xs font-medium ${getSignalColor(device.rssi)}`}
                    >
                      {getSignalStrength(device.rssi)}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {device.rssi} dBm
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={handleStartScan}
                disabled={isScanning}
              >
                Scan Again
              </Button>
              <Button
                onClick={handleConnect}
                disabled={!selectedDevice || isConnecting}
              >
                Connect
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "connecting" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin" />
                Connecting
              </DialogTitle>
              <DialogDescription>
                Connecting to {selectedDevice?.name}...
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="relative">
                <Bluetooth className="h-12 w-12 text-blue-500" />
                <div className="absolute inset-0 animate-ping">
                  <Bluetooth className="h-12 w-12 text-blue-500 opacity-30" />
                </div>
              </div>
              <p className="text-muted-foreground text-center text-sm">
                Please wait while we establish a connection...
              </p>
            </div>
          </>
        )}

        {step === "connected" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-green-600">
                ✓ Connected Successfully
              </DialogTitle>
              <DialogDescription>
                Your device has been connected and is being added to your
                account.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="rounded-full bg-green-100 p-4">
                <Bluetooth className="h-8 w-8 text-green-600" />
              </div>
              <p className="text-muted-foreground text-center text-sm">
                {selectedDevice?.name} is now ready to use!
              </p>
              {createDeviceMutation.isPending && (
                <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
              )}
            </div>
          </>
        )}

        {step === "error" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600">
                <WifiOff className="h-5 w-5" />
                Connection Failed
              </DialogTitle>
              <DialogDescription>{errorMessage}</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="rounded-full bg-red-100 p-4">
                <WifiOff className="h-8 w-8 text-red-600" />
              </div>
              <p className="text-muted-foreground text-center text-sm">
                Please check your device and try again.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleStartScan}>Try Again</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
