import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AnimatedListItem } from '../components/AnimatedListItem';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { useThemedStyles } from '../theme/useThemedStyles';
import type { ThemeColors, ThemeShadows } from '../theme';
import { TYPOGRAPHY, SPACING } from '../constants';
import { useWildlifeStore } from '../stores/wildlifeStore';
import type { EmbeddingPack } from '../types/wildlife';
import type { RootStackParamList } from '../navigation/types';
import { GANESHA_PROJECT_ID } from '../config/ganeshaApi';
import { resolveMiewidModelSource } from '../services/modelSourceResolver';
import { acquireMiewidModel } from '../services/miewidModelManager';
import { acquireLatestPack } from '../services/packDownloadService';
import logger from '../utils/logger';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const KB = 1024;
const MB = KB * 1024;
const GB = MB * 1024;

function formatBytes(bytes: number): string {
  if (bytes < MB) {
    return `${(bytes / KB).toFixed(1)} KB`;
  }
  if (bytes < GB) {
    return `${(bytes / MB).toFixed(1)} MB`;
  }
  return `${(bytes / GB).toFixed(1)} GB`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString();
}

export const PacksScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const styles = useThemedStyles(createStyles);
  const { packs, miewidModel } = useWildlifeStore();
  const [isDownloading, setIsDownloading] = useState(false);

  const handlePackPress = (pack: EmbeddingPack) => {
    navigation.navigate('PackDetails', { packId: pack.id });
  };

  const handleDownloadPack = useCallback(async () => {
    setIsDownloading(true);
    try {
      // The MiewID model is a separate download from the pack -- only fetch
      // it if it isn't already installed and verified, so re-downloading a
      // pack update doesn't re-pull the ~200MB model every time.
      if (!miewidModel || miewidModel.status !== 'ready') {
        const resolvedSource = await resolveMiewidModelSource();
        if (!resolvedSource.ok) {
          Alert.alert(
            'Download failed',
            `Could not reach the model server: ${resolvedSource.message}`,
          );
          return;
        }
        const record = await acquireMiewidModel(resolvedSource.source);
        if (record.status !== 'ready') {
          Alert.alert(
            'Download failed',
            `The MiewID model could not be installed (status: ${record.status}).`,
          );
          return;
        }
      }

      const packResult = await acquireLatestPack(GANESHA_PROJECT_ID);
      if (!packResult.ok) {
        Alert.alert(
          'Download failed',
          `Could not download the embedding pack: ${packResult.message}`,
        );
        return;
      }
      logger.log(`[PacksScreen] Installed pack ${packResult.pack.id}`);
    } finally {
      setIsDownloading(false);
    }
  }, [miewidModel]);

  const renderPack = ({
    item,
    index,
  }: {
    item: EmbeddingPack;
    index: number;
  }) => (
    <AnimatedListItem
      index={index}
      onPress={() => handlePackPress(item)}
      testID={`pack-card-${index}`}
    >
      <Card>
        <Text style={styles.packName}>{item.displayName}</Text>
        <Text style={styles.packCount}>{item.individualCount} individuals</Text>
        <Text style={styles.packMeta}>
          Exported: {formatDate(item.exportDate)} ·{' '}
          {formatBytes(item.sizeBytes)}
        </Text>
      </Card>
    </AnimatedListItem>
  );

  return (
    <SafeAreaView
      style={styles.container}
      testID="packs-screen"
      edges={['top']}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Packs</Text>
      </View>

      {packs.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No Packs Downloaded</Text>
          <Text style={styles.emptyText}>
            Download an embedding pack to start identifying individuals in the
            field.
          </Text>
          <Button
            title="Download Latest Pack"
            onPress={handleDownloadPack}
            loading={isDownloading}
            style={styles.downloadButton}
            testID="download-pack-button"
          />
        </View>
      ) : (
        <FlatList
          data={packs}
          renderItem={renderPack}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
};

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
  list: {
    padding: SPACING.lg,
  },
  packName: {
    ...TYPOGRAPHY.h2,
    color: colors.text,
    marginBottom: SPACING.xs,
  },
  packCount: {
    ...TYPOGRAPHY.bodySmall,
    color: colors.textSecondary,
    marginBottom: SPACING.xs,
  },
  packMeta: {
    ...TYPOGRAPHY.meta,
    color: colors.textMuted,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    paddingHorizontal: SPACING.xxl,
  },
  emptyTitle: {
    ...TYPOGRAPHY.h2,
    color: colors.text,
    fontWeight: '400' as const,
    marginBottom: SPACING.sm,
  },
  emptyText: {
    ...TYPOGRAPHY.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center' as const,
    lineHeight: 18,
  },
  downloadButton: {
    marginTop: SPACING.lg,
    minWidth: 220,
  },
});
