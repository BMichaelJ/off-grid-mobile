import React, { useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import { Card } from '../components';
import { useThemedStyles } from '../theme/useThemedStyles';
import { useTheme } from '../theme';
import type { ThemeColors, ThemeShadows } from '../theme';
import { TYPOGRAPHY, SPACING } from '../constants';
import { useWildlifeStore } from '../stores/wildlifeStore';
import type { SyncQueueItem, SyncStatus } from '../types/wildlife';

// ---------------------------------------------------------------------------
// Status display helpers
// ---------------------------------------------------------------------------

interface StatusConfig {
  label: string;
  colorKey: 'statusWarning' | 'statusSuccess' | 'statusError';
  icon: string;
}

function getStatusConfig(status: SyncStatus): StatusConfig {
  switch (status) {
    case 'pending':
      return { label: 'Pending', colorKey: 'statusWarning', icon: 'clock' };
    case 'uploading':
      return { label: 'Uploading', colorKey: 'statusWarning', icon: 'upload-cloud' };
    case 'synced':
      return { label: 'Synced', colorKey: 'statusSuccess', icon: 'check-circle' };
    case 'failed':
      return { label: 'Failed', colorKey: 'statusError', icon: 'alert-circle' };
    case 'failedPermanent':
      return { label: 'Failed', colorKey: 'statusError', icon: 'x-circle' };
  }
}

function truncateId(id: string, maxLength = 12): string {
  if (id.length <= maxLength) {
    return id;
  }
  return `${id.slice(0, maxLength)}...`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const SyncScreen: React.FC = () => {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const syncQueue = useWildlifeStore((s) => s.syncQueue);
  const updateSyncStatus = useWildlifeStore((s) => s.updateSyncStatus);

  const handleSyncAll = useCallback(() => {
    Alert.alert('Sync', 'Sync not yet implemented');
  }, []);

  const handleRetry = useCallback(
    (item: SyncQueueItem) => {
      updateSyncStatus(item.observationId, {
        status: 'pending',
        retryCount: item.retryCount + 1,
      });
    },
    [updateSyncStatus],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: SyncQueueItem; index: number }) => {
      const config = getStatusConfig(item.status);
      const statusColor = colors[config.colorKey];
      const isFailed = item.status === 'failed' || item.status === 'failedPermanent';

      return (
        <Card style={styles.itemCard} testID={`sync-item-${index}`}>
          <View style={styles.itemRow}>
            <View style={styles.itemContent}>
              <Text style={styles.observationId} testID={`sync-item-id-${index}`}>
                {truncateId(item.observationId)}
              </Text>
              <View style={styles.statusRow}>
                <View
                  style={[styles.statusBadge, { backgroundColor: statusColor }]}
                  testID={`sync-status-${item.status}`}
                />
                <Text style={styles.statusText}>{config.label}</Text>
              </View>
              {item.lastError && (
                <Text style={styles.errorText} testID={`sync-error-${index}`}>
                  {item.lastError}
                </Text>
              )}
            </View>
            <View style={styles.itemActions}>
              <Icon name={config.icon} size={18} color={statusColor} />
              {isFailed && (
                <TouchableOpacity
                  style={styles.retryButton}
                  onPress={() => handleRetry(item)}
                  testID={`sync-retry-${index}`}
                >
                  <Icon name="refresh-cw" size={14} color={styles.retryText.color} />
                  <Text style={styles.retryText}>Retry</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </Card>
      );
    },
    [styles, handleRetry],
  );

  return (
    <SafeAreaView style={styles.container} testID="sync-screen" edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Sync Queue</Text>
      </View>

      <TouchableOpacity
        style={styles.syncAllButton}
        onPress={handleSyncAll}
        testID="sync-all-button"
      >
        <Icon name="upload-cloud" size={16} color={styles.syncAllText.color} />
        <Text style={styles.syncAllText}>Sync All</Text>
      </TouchableOpacity>

      {syncQueue.length === 0 ? (
        <View style={styles.emptyState}>
          <Icon name="inbox" size={48} color={styles.emptyTitle.color} />
          <Text style={styles.emptyTitle}>No items in sync queue</Text>
        </View>
      ) : (
        <FlatList
          data={syncQueue}
          renderItem={renderItem}
          keyExtractor={(item) => item.observationId}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const createStyles = (colors: ThemeColors, shadows: ThemeShadows) => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
    ...shadows.small,
    zIndex: 1,
  },
  title: {
    ...TYPOGRAPHY.h2,
    color: colors.text,
  },
  syncAllButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: colors.primary,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    paddingVertical: SPACING.md,
    borderRadius: 8,
    gap: SPACING.sm,
  },
  syncAllText: {
    ...TYPOGRAPHY.body,
    color: colors.background,
    fontWeight: '600' as const,
  },
  list: {
    padding: SPACING.lg,
  },
  itemCard: {
    marginBottom: SPACING.md,
  },
  itemRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'flex-start' as const,
  },
  itemContent: {
    flex: 1,
    marginRight: SPACING.md,
  },
  observationId: {
    ...TYPOGRAPHY.body,
    color: colors.text,
    fontWeight: '500' as const,
    marginBottom: SPACING.xs,
  },
  statusRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: SPACING.xs,
  },
  statusBadge: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    ...TYPOGRAPHY.bodySmall,
    color: colors.textSecondary,
  },
  errorText: {
    ...TYPOGRAPHY.meta,
    color: colors.error,
    marginTop: SPACING.xs,
  },
  itemActions: {
    alignItems: 'flex-end' as const,
    gap: SPACING.sm,
  },
  retryButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: SPACING.xs,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  retryText: {
    ...TYPOGRAPHY.meta,
    color: colors.primary,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    paddingHorizontal: SPACING.xxl,
    gap: SPACING.md,
  },
  emptyTitle: {
    ...TYPOGRAPHY.body,
    color: colors.textMuted,
    textAlign: 'center' as const,
  },
});
