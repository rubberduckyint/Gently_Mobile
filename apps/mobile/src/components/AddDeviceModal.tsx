import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  Modal, 
  TouchableOpacity, 
  FlatList, 
  ActivityIndicator,
  Alert,
  StyleSheet 
} from 'react-native';
import { useGentlyBluetooth } from '../hooks/useGentlyBluetooth';
import { GentlyDiscoveredDevice, GentlyPairedDevice } from '../services/GentlyTypes';

interface AddDeviceModalProps {
  visible: boolean;
  onClose: () => void;
  onDeviceAdded: (device: GentlyPairedDevice) => void;
}

export const AddDeviceModal: React.FC<AddDeviceModalProps> = ({
  visible,
  onClose,
  onDeviceAdded,
}) => {
  const [connectingToDevice, setConnectingToDevice] = useState<string | null>(null);

  const {
    discoveredDevices,
    isScanning,
    error,
    startScan,
    stopScan,
    connectToDevice,
  } = useGentlyBluetooth();

  useEffect(() => {
    if (visible) {
      startScanning();
    } else {
      stopScanning();
    }

    return () => {
      stopScanning();
    };
  }, [visible]);

  const startScanning = async () => {
    try {
      await startScan();
    } catch (error) {
      console.error('Error starting device scan:', error);
      Alert.alert('Scan Error', 'Failed to start device discovery.');
    }
  };

  const stopScanning = async () => {
    try {
      await stopScan();
    } catch (error) {
      console.error('Error stopping scan:', error);
    }
  };

  const handleConnectToDevice = async (device: GentlyDiscoveredDevice) => {
    try {
      setConnectingToDevice(device.uniqueId);
      
      await connectToDevice(device.uniqueId);
      
      // Device connection is handled in the hook, just close modal
      onClose();
      Alert.alert('Success', `Connected to ${device.name}`);
    } catch (error) {
      console.error('Connection error:', error);
      Alert.alert(
        'Connection Failed', 
        `Failed to connect to ${device.name}. Please try again.`
      );
    } finally {
      setConnectingToDevice(null);
    }
  };

  const renderDeviceItem = ({ item }: { item: GentlyDiscoveredDevice }) => {
    const isConnecting = connectingToDevice === item.uniqueId;
    
    return (
      <TouchableOpacity
        style={styles.deviceItem}
        onPress={() => handleConnectToDevice(item)}
        disabled={isConnecting}
      >
        <View style={styles.deviceInfo}>
          <Text style={styles.deviceName}>{item.name}</Text>
          <Text style={styles.deviceId}>ID: {item.uniqueId}</Text>
          <Text style={styles.deviceRssi}>Signal: {item.rssi} dBm</Text>
          {item.isFactoryMode && <Text style={styles.pairedText}>Factory Mode</Text>}
        </View>
        {isConnecting && (
          <ActivityIndicator size="small" color="#007AFF" />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Add Gently Device</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          <View style={styles.scanSection}>
            <Text style={styles.sectionTitle}>Nearby Devices</Text>
            {isScanning ? (
              <View style={styles.scanningContainer}>
                <ActivityIndicator size="large" color="#007AFF" />
                <Text style={styles.scanningText}>Scanning for devices...</Text>
                <TouchableOpacity onPress={stopScanning} style={styles.stopButton}>
                  <Text style={styles.stopButtonText}>Stop Scanning</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity onPress={startScanning} style={styles.scanButton}>
                <Text style={styles.scanButtonText}>Start Scanning</Text>
              </TouchableOpacity>
            )}
          </View>

          <FlatList
            data={discoveredDevices}
            keyExtractor={(item) => item.id}
            renderItem={renderDeviceItem}
            style={styles.deviceList}
            ListEmptyComponent={
              !isScanning ? (
                <Text style={styles.emptyText}>
                  No devices found. Make sure your Gently device is nearby and in pairing mode.
                </Text>
              ) : null
            }
          />
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  closeButton: {
    padding: 8,
  },
  closeButtonText: {
    color: '#007AFF',
    fontSize: 16,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  scanSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  scanningContainer: {
    alignItems: 'center',
    padding: 20,
  },
  scanningText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  stopButton: {
    marginTop: 12,
    padding: 8,
    backgroundColor: '#ff3b30',
    borderRadius: 8,
  },
  stopButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  scanButton: {
    backgroundColor: '#007AFF',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  scanButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  deviceList: {
    flex: 1,
  },
  deviceItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    marginBottom: 8,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  deviceId: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  deviceRssi: {
    fontSize: 12,
    color: '#999',
  },
  pairedText: {
    fontSize: 12,
    color: '#34c759',
    fontWeight: '600',
    marginTop: 4,
  },
  emptyText: {
    textAlign: 'center',
    color: '#666',
    fontSize: 16,
    marginTop: 40,
    paddingHorizontal: 20,
  },
});
