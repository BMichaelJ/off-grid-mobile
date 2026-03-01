import type { ThemeColors, ThemeShadows } from '../../theme';
import { TYPOGRAPHY, SPACING } from '../../constants';

export const createStyles = (colors: ThemeColors, _shadows: ThemeShadows) => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    paddingHorizontal: SPACING.xxl,
  },
  title: {
    ...TYPOGRAPHY.h1,
    color: colors.text,
    marginBottom: SPACING.sm,
  },
  subtitle: {
    ...TYPOGRAPHY.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center' as const,
    marginBottom: SPACING.xxl,
  },
  buttonContainer: {
    width: '100%' as const,
    gap: SPACING.md,
  },
  button: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: colors.surface,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.xl,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    gap: SPACING.md,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    ...TYPOGRAPHY.h2,
    color: colors.text,
  },
  processingContainer: {
    alignItems: 'center' as const,
    gap: SPACING.md,
  },
  processingText: {
    ...TYPOGRAPHY.body,
    color: colors.textSecondary,
  },
});
