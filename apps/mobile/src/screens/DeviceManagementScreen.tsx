import React, { useEffect, useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  FlatList, 
  RefreshControl, 
  TouchableOpacity,
  Alert 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useGentlyBluetooth } from '~/hooks/useGentlyBluetooth';
import { DeviceCard } from '~/components/DeviceCard';
import { SyncStatusComponent } from '~/components/SyncStatusComponent';
import { trpc } from '~/utils/api';

export const DeviceManagementScreen: React.FC = () => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isAutoSyncing, setIsAutoSyncing] = useState(false);
  
  const { 
    pairedDevices, 
    refreshPairedDevices, 
    syncWithCloud, 
    pendingSyncCount,
    error 
  } = useGentlyBluetooth();

  // Auto-sync when the screen loads if there are pending operations
  useEffect(() => {
    if (pendingSyncCount > 0 && !isAutoSyncing) {
      handleAutoSync();
    }
  }, [pendingSyncCount]);

  const handleAutoSync = async () => {
    try {
      setIsAutoSyncing(true);
      console.log('Auto-syncing pending operations...');
      
      const result = await syncWithCloud(trpc);
      
      if (result.success) {
        console.log(`Auto-sync completed: ${result.syncedCount} operations synced`);
      } else {
        console.warn(`Auto-sync partially failed: ${result.failedCount} operations failed`);
      }
    } catch (error) {
      console.error('Auto-sync failed:', error);
      // Don't show alert for auto-sync failures, just log them
    } finally {
      setIsAutoSyncing(false);
    }
  };

  const handleRefresh = async () => {
    try {
      setIsRefreshing(true);
      await refreshPairedDevices();
      
      // Try to sync if there are pending operations
      if (pendingSyncCount > 0) {
        await handleAutoSync();
      }
    } catch (error) {
      console.error('Refresh failed:', error);
      Alert.alert(
        'Refresh Failed',
        error instanceof Error ? error.message : 'Unknown error occurred'
      );
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleDeviceDeleted = (deviceId: string) => {
    // Device has been deleted locally, refresh the list
    refreshPairedDevices();
  };

  const handleManualSync = async () => {
    if (pendingSyncCount === 0) {
      Alert.alert('No Sync Needed', 'All changes are already synced to the cloud.');
      return;
    }

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
          `Synced ${result.syncedCount} changes, but ${result.failedCount} failed. They will be retried automatically.`
        );
      }
    } catch (error) {
      Alert.alert(
        'Sync Failed',
        error instanceof Error ? error.message : 'Unknown error occurred'
      );
    }
  };

  const renderDevice = ({ item }: { item: any }) => (
    <DeviceCard 
      device={item} 
      onDeviceDeleted={handleDeviceDeleted}
    />
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyTitle}>No Devices Found</Text>
      <Text style={styles.emptySubtitle}>
        Add a device to get started with Gently monitoring
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>My Devices</Text>
        {pendingSyncCount > 0 && (
          <TouchableOpacity 
            style={styles.syncButton}
            onPress={handleManualSync}
          >
            <Text style={styles.syncButtonText}>
              Sync ({pendingSyncCount})
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <SyncStatusComponent style={styles.syncStatus} />

      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>⚠️ {error}</Text>
        </View>
      )}

      <FlatList
        data={pairedDevices}
        renderItem={renderDevice}
        keyExtractor={(item) => item.uniqueId}
        ListEmptyComponent={renderEmptyState}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor="#0ea5e9"
          />
        }
        style={styles.deviceList}
        showsVerticalScrollIndicator={false}
      />

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          {pairedDevices.length} device{pairedDevices.length !== 1 ? 's' : ''} found
        </Text>
        {isAutoSyncing && (
          <Text style={styles.syncingText}>Auto-syncing...</Text>
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1f2937',
  },
  syncButton: {
    backgroundColor: '#0ea5e9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  syncButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  syncStatus: {
    marginHorizontal: 16,
  },
  errorContainer: {
    backgroundColor: '#fef2f2',
    borderColor: '#ef4444',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginHorizontal: 16,
    marginVertical: 8,
  },
  errorText: {
    color: '#dc2626',
    fontSize: 14,
  },
  deviceList: {
    flex: 1,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 24,
  },
  footer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerText: {
    fontSize: 14,
    color: '#6b7280',
  },
  syncingText: {
    fontSize: 14,
    color: '#0ea5e9',
    fontStyle: 'italic',
  },
});

export default DeviceManagementScreen;
