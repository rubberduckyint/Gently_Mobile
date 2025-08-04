import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useGentlyBluetooth } from '~/hooks/useGentlyBluetooth';
import { GentlyPairedDevice, GentlyDeviceSyncStatus } from '~/services/GentlyTypes';

interface DeviceCardProps {
  device: GentlyPairedDevice;
  onDeviceDeleted?: (deviceId: string) => void;
}

export const DeviceCard: React.FC<DeviceCardProps> = ({ device, onDeviceDeleted }) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const { deleteDevice } = useGentlyBluetooth();

  const handleDeleteDevice = async () => {
    Alert.alert(
      'Delete Device',
      `Are you sure you want to delete "${device.name}"? This will reset the device to factory mode and remove it from your account.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsDeleting(true);
              
              // Use local-first deletion - this handles both BLE factory reset and queues cloud sync
              await deleteDevice(device.uniqueId);
              
              // Notify parent component
              onDeviceDeleted?.(device.uniqueId);
              
              // Show success message
              Alert.alert(
                'Device Deleted',
                'Device has been removed from your account and will be synced with the cloud when connectivity allows.',
                [{ text: 'OK' }]
              );
              
            } catch (error) {
              console.error('Device deletion failed:', error);
              Alert.alert(
                'Deletion Failed',
                error instanceof Error ? error.message : 'An unexpected error occurred',
                [{ text: 'OK' }]
              );
            } finally {
              setIsDeleting(false);
            }
          }
        }
      ]
    );
  };

  const getSyncStatusColor = () => {
    switch (device.syncStatus) {
      case GentlyDeviceSyncStatus.PENDING_DELETE:
        return '#f59e0b';
      case GentlyDeviceSyncStatus.PENDING_UPDATE:
        return '#3b82f6';
      case GentlyDeviceSyncStatus.SYNC_ERROR:
        return '#ef4444';
      case GentlyDeviceSyncStatus.SYNCED:
      default:
        return '#10b981';
    }
  };

  const getSyncStatusText = () => {
    switch (device.syncStatus) {
      case GentlyDeviceSyncStatus.PENDING_DELETE:
        return 'Pending deletion';
      case GentlyDeviceSyncStatus.PENDING_UPDATE:
        return 'Pending update';
      case GentlyDeviceSyncStatus.SYNC_ERROR:
        return 'Sync error';
      case GentlyDeviceSyncStatus.SYNCED:
      default:
        return 'Synced';
    }
  };

  // If device is marked as deleted locally, show dimmed appearance
  const isDeleted = device.deletedLocally;

  return (
    <View style={[styles.card, isDeleted && styles.deletedCard]}>
      <View style={styles.deviceInfo}>
        <Text style={[styles.deviceName, isDeleted && styles.deletedText]}>
          {device.name}
        </Text>
        <Text style={[styles.deviceId, isDeleted && styles.deletedText]}>
          ID: {device.uniqueId}
        </Text>
        {device.lastConnected && (
          <Text style={[styles.lastConnected, isDeleted && styles.deletedText]}>
            Last connected: {device.lastConnected.toLocaleDateString()}
          </Text>
        )}
        
        {/* Sync Status Indicator */}
        <View style={styles.syncStatusContainer}>
          <View style={[
            styles.syncStatusDot, 
            { backgroundColor: getSyncStatusColor() }
          ]} />
          <Text style={[styles.syncStatusText, isDeleted && styles.deletedText]}>
            {getSyncStatusText()}
          </Text>
        </View>
        
        {isDeleted && (
          <Text style={styles.deletedNotice}>
            ⚠️ Deleted locally - will be removed from cloud when synced
          </Text>
        )}
      </View>

      <View style={styles.actions}>
        {!isDeleted && (
          <TouchableOpacity
            style={[styles.deleteButton, isDeleting && styles.disabledButton]}
            onPress={handleDeleteDevice}
            disabled={isDeleting}
          >
            {isDeleting ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text style={styles.deleteButtonText}>Delete</Text>
            )}
          </TouchableOpacity>
        )}
        
        {isDeleted && (
          <Text style={styles.deletedLabel}>DELETED</Text>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginVertical: 8,
    marginHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  deletedCard: {
    backgroundColor: '#f9fafb',
    opacity: 0.7,
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 4,
  },
  deviceId: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 4,
  },
  lastConnected: {
    fontSize: 12,
    color: '#9ca3af',
    marginBottom: 8,
  },
  syncStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  syncStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  syncStatusText: {
    fontSize: 12,
    color: '#6b7280',
  },
  deletedNotice: {
    fontSize: 12,
    color: '#f59e0b',
    marginTop: 4,
    fontStyle: 'italic',
  },
  deletedText: {
    color: '#9ca3af',
  },
  actions: {
    alignItems: 'center',
  },
  deleteButton: {
    backgroundColor: '#ef4444',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  disabledButton: {
    backgroundColor: '#9ca3af',
  },
  deleteButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  deletedLabel: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: '600',
    backgroundColor: '#fef2f2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    borderColor: '#ef4444',
    borderWidth: 1,
  },
});
