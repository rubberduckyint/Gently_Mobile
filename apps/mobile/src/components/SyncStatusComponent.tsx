import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useGentlyBluetooth } from '~/hooks/useGentlyBluetooth';
import { trpc } from '~/utils/api';

interface SyncStatusProps {
  style?: any;
}

export const SyncStatusComponent: React.FC<SyncStatusProps> = ({ style }) => {
  const { pendingSyncCount, syncWithCloud } = useGentlyBluetooth();

  const handleSync = async () => {
    if (pendingSyncCount === 0) {
      Alert.alert('No Sync Needed', 'All changes are already synced to the cloud.');
      return;
    }

    Alert.alert(
      'Sync with Cloud',
      `You have ${pendingSyncCount} pending changes. Do you want to sync now?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sync',
          onPress: async () => {
            try {
              const result = await syncWithCloud(trpc);
              
              if (result.success) {
                Alert.alert(
                  'Sync Complete',
                  `Successfully synced ${result.syncedCount} changes to the cloud.`
                );
              } else {
                Alert.alert(
                  'Sync Partially Failed',
                  `Synced ${result.syncedCount} changes, but ${result.failedCount} failed. They will be retried later.`
                );
              }
            } catch (error) {
              Alert.alert(
                'Sync Failed',
                error instanceof Error ? error.message : 'Unknown error occurred'
              );
            }
          }
        }
      ]
    );
  };

  if (pendingSyncCount === 0) {
    return (
      <View style={[styles.container, styles.synced, style]}>
        <Text style={styles.syncedText}>✓ All changes synced</Text>
      </View>
    );
  }

  return (
    <TouchableOpacity 
      style={[styles.container, styles.pending, style]} 
      onPress={handleSync}
    >
      <Text style={styles.pendingText}>
        {pendingSyncCount} changes pending sync
      </Text>
      <Text style={styles.tapText}>Tap to sync</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 12,
    borderRadius: 8,
    marginVertical: 8,
  },
  synced: {
    backgroundColor: '#f0f9ff',
    borderColor: '#0ea5e9',
    borderWidth: 1,
  },
  pending: {
    backgroundColor: '#fff7ed',
    borderColor: '#f59e0b',
    borderWidth: 1,
  },
  syncedText: {
    color: '#0ea5e9',
    fontSize: 14,
    textAlign: 'center',
  },
  pendingText: {
    color: '#f59e0b',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  tapText: {
    color: '#92400e',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 2,
  },
});
