import React, { useCallback, useState } from 'react';
import { View, Text, TextInput, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/Feather';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { useTheme, useThemedStyles } from '../theme';
import type { ThemeColors, ThemeShadows } from '../theme';
import { TYPOGRAPHY, SPACING } from '../constants';
import { GANESHA_ORG_ID } from '../config/ganeshaApi';
import { ganeshaApiClient } from '../services/ganeshaApiClient';
import type { RootStackParamList } from '../navigation/types';
import type { CreateUserProfilePayload } from '../services/ganeshaApiClient';

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'SelectRole'>;

type Role = CreateUserProfilePayload['role'];

/**
 * First-sign-in-only step, reached from SignInScreen when GET /users/profile
 * comes back 404 -- mirrors the web app's `select-role` page (same backend
 * endpoint, same orgId, same two roles) so a person's role/org is
 * consistent whichever client they signed up from first.
 */
export const SelectRoleScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [name, setName] = useState('');
  const [savingRole, setSavingRole] = useState<Role | null>(null);

  const handleSelectRole = useCallback(
    async (role: Role) => {
      const trimmedName = name.trim();
      if (!trimmedName) {
        Alert.alert('Name required', 'Please enter your name first.');
        return;
      }

      setSavingRole(role);
      const result = await ganeshaApiClient.createUserProfile({
        name: trimmedName,
        role,
        orgId: GANESHA_ORG_ID,
      });
      setSavingRole(null);

      if (!result.ok) {
        Alert.alert('Could not save your role', result.message);
        return;
      }

      navigation.replace('Main');
    },
    [name, navigation],
  );

  const isSaving = savingRole !== null;

  return (
    <SafeAreaView style={styles.container} testID="select-role-screen" edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Select Your Role</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.subtitle}>
          Choose how you&apos;d like to contribute to elephant conservation
        </Text>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Your name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Enter your name"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="words"
            testID="select-role-name-input"
          />
        </View>

        <Card style={styles.roleCard}>
          <Button
            title="Researcher"
            variant="primary"
            onPress={() => handleSelectRole('researcher')}
            loading={savingRole === 'researcher'}
            disabled={isSaving}
            icon={<Icon name="clipboard" size={16} color={colors.background} />}
            testID="select-role-researcher-button"
          />
          <Text style={styles.roleHint}>
            Manage projects, verify identifications, access full data
          </Text>
        </Card>

        <Card style={styles.roleCard}>
          <Button
            title="Citizen Scientist"
            variant="secondary"
            onPress={() => handleSelectRole('citizen')}
            loading={savingRole === 'citizen'}
            disabled={isSaving}
            icon={<Icon name="camera" size={16} color={colors.primary} />}
            testID="select-role-citizen-button"
          />
          <Text style={styles.roleHint}>
            Capture photos and contribute sightings
          </Text>
        </Card>

        <Text style={styles.footnote}>
          You can change your role later from Settings.
        </Text>
      </ScrollView>
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
  },
  title: {
    ...TYPOGRAPHY.h2,
    color: colors.text,
  },
  content: {
    padding: SPACING.lg,
  },
  subtitle: {
    ...TYPOGRAPHY.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center' as const,
    marginBottom: SPACING.lg,
  },
  inputGroup: {
    marginBottom: SPACING.lg,
  },
  inputLabel: {
    ...TYPOGRAPHY.bodySmall,
    color: colors.text,
    marginBottom: SPACING.sm,
  },
  input: {
    ...TYPOGRAPHY.body,
    backgroundColor: colors.surfaceLight,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    padding: SPACING.md,
    color: colors.text,
  },
  roleCard: {
    marginBottom: SPACING.md,
    gap: SPACING.sm,
  },
  roleHint: {
    ...TYPOGRAPHY.meta,
    color: colors.textMuted,
  },
  footnote: {
    ...TYPOGRAPHY.meta,
    color: colors.textMuted,
    textAlign: 'center' as const,
    marginTop: SPACING.lg,
  },
});
