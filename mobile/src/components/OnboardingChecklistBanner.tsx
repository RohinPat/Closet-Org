import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { CompositeNavigationProp } from '@react-navigation/native';
import { useFocusEffect } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MainTabParamList, AppStackParamList } from '../navigation/RootNavigator';
import * as api from '../api/client';
import type { ClothingItem } from '../api/types';
import { useTheme, useThemedStyles, type ThemeContextValue } from '../context/ThemeContext';
import { GlassCard } from './Glass';
import {
  readOnboardingChecklistDismissedSync,
  readOnboardingItemDetailVisitedSync,
  setOnboardingChecklistDismissed,
} from '../preferences';
import { radii, shadow, spacing, typography } from '../theme';

type Nav = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'ClosetTab'>,
  NativeStackNavigationProp<AppStackParamList>
>;

type Props = {
  navigation: Nav;
  userId: number;
  /** First item in the current closet list for “open an item” deep link */
  firstItem: ClothingItem | null;
};

type CheckState = {
  hasItem: boolean;
  openedDetail: boolean;
  hasSavedFit: boolean;
};

const STEPS: { label: string; key: keyof CheckState }[] = [
  { label: 'Add your first item', key: 'hasItem' },
  { label: 'Open an item', key: 'openedDetail' },
  { label: 'Save your first outfit', key: 'hasSavedFit' },
];

export function OnboardingChecklistBanner({
  navigation,
  userId,
  firstItem,
}: Props) {
  const { colors } = useTheme();
  const { width: winW } = useWindowDimensions();
  const styles = useThemedStyles(makeStyles);
  const bannerWidth = Math.min(winW * 0.92, 480);
  const [dismissed, setDismissed] = useState(readOnboardingChecklistDismissedSync);
  const [check, setCheck] = useState<CheckState | null>(null);

  const refresh = useCallback(async () => {
    if (dismissed) return;
    try {
      const [stats, postsRes] = await Promise.all([
        api.fetchStats(),
        api.fetchUserPosts(userId),
      ]);
      setCheck({
        hasItem: stats.total_items >= 1,
        openedDetail: readOnboardingItemDetailVisitedSync(),
        hasSavedFit: postsRes.posts.length >= 1,
      });
    } catch {
      setCheck(null);
    }
  }, [dismissed, userId]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  async function onDismissExplore() {
    await setOnboardingChecklistDismissed();
    setDismissed(true);
  }

  if (dismissed || check === null) return null;

  const allDone = check.hasItem && check.openedDetail && check.hasSavedFit;
  if (allDone) return null;

  const doneCount = STEPS.filter((s) => check[s.key]).length;

  function onRowPress(stepIndex: number) {
    if (stepIndex === 0) {
      navigation.navigate('UploadTab');
    } else if (stepIndex === 1) {
      if (firstItem) {
        navigation.navigate('ItemDetail', { item: firstItem });
      } else {
        navigation.navigate('UploadTab');
      }
    } else {
      navigation.navigate('CreateFit');
    }
  }

  return (
    <View style={[styles.shell, { width: bannerWidth }]}>
      <LinearGradient
        colors={colors.accentGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.accentBar}
      />
      <GlassCard style={[styles.card, shadow.card]} padded>
        <View style={styles.headerRow}>
          <View style={styles.headerTitleBlock}>
            <View style={styles.headerIconWrap}>
              <LinearGradient
                colors={colors.accentGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.headerIconGrad}
              >
                <Ionicons name="sparkles" size={18} color="#FFFFFF" />
              </LinearGradient>
            </View>
            <View>
              <Text style={styles.title}>Getting started</Text>
              <Text style={styles.subtitle}>
                {doneCount} of {STEPS.length} complete
              </Text>
            </View>
          </View>
          <Pressable
            onPress={() => void onDismissExplore()}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Hide getting started checklist"
            style={({ pressed }) => [{ opacity: pressed ? 0.75 : 1 }]}
          >
            <Text style={styles.exploreLink}>I'll explore</Text>
          </Pressable>
        </View>

        <View style={styles.divider} />

        {STEPS.map((step, i) => {
          const done = check[step.key];
          return (
            <Pressable
              key={step.key}
              style={({ pressed }) => [
                styles.row,
                i === 0 && styles.rowFirst,
                i < STEPS.length - 1 && styles.rowBorder,
                { opacity: pressed ? 0.92 : 1 },
              ]}
              onPress={() => onRowPress(i)}
              accessibilityRole="button"
              accessibilityState={{ checked: done }}
            >
              <View
                style={[
                  styles.stepBadge,
                  done && { backgroundColor: colors.accentSoft, borderColor: colors.accent },
                ]}
              >
                {done ? (
                  <Ionicons name="checkmark" size={16} color={colors.accent} />
                ) : (
                  <Text style={styles.stepNum}>{i + 1}</Text>
                )}
              </View>
              <Text
                style={[styles.rowText, done && styles.rowTextDone]}
                numberOfLines={2}
              >
                {step.label}
              </Text>
              <View style={styles.chevronWrap}>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </View>
            </Pressable>
          );
        })}
      </GlassCard>
    </View>
  );
}

function makeStyles(t: ThemeContextValue) {
  const { colors, surface } = t;
  return StyleSheet.create({
    shell: {
      alignSelf: 'center',
      marginTop: spacing.md,
      marginBottom: spacing.lg,
      borderRadius: radii.xl,
      overflow: 'hidden',
    },
    accentBar: {
      height: 4,
      width: '100%',
    },
    card: {
      borderTopLeftRadius: 0,
      borderTopRightRadius: 0,
      borderRadius: radii.xl,
      marginTop: -1,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.md,
      paddingTop: spacing.xs,
      minHeight: 48,
    },
    headerTitleBlock: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      flex: 1,
      paddingRight: spacing.md,
      minWidth: 0,
    },
    headerIconWrap: {
      borderRadius: radii.md,
      overflow: 'hidden',
      ...shadow.button,
    },
    headerIconGrad: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      ...typography.headline,
      fontSize: 18,
      color: colors.text,
      letterSpacing: -0.2,
    },
    subtitle: {
      ...typography.caption,
      color: colors.textMuted,
      marginTop: 4,
      fontSize: 13,
    },
    exploreLink: {
      ...typography.bodyMedium,
      fontSize: 14,
      color: colors.accent,
      paddingLeft: spacing.sm,
      paddingVertical: spacing.xs,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: surface.cardBorder,
      marginBottom: spacing.sm,
      opacity: 0.85,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: 16,
      paddingHorizontal: spacing.xs,
    },
    rowFirst: {
      paddingTop: 12,
    },
    rowBorder: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: surface.cardBorder,
    },
    stepBadge: {
      width: 30,
      height: 30,
      borderRadius: 15,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: surface.secondaryBorder,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: surface.secondaryOverlay,
    },
    stepNum: {
      ...typography.caption,
      fontSize: 13,
      fontWeight: '700',
      color: colors.textMuted,
    },
    rowText: {
      ...typography.body,
      fontSize: 16,
      color: colors.text,
      flex: 1,
      lineHeight: 22,
      paddingRight: spacing.xs,
    },
    rowTextDone: {
      color: colors.textSecondary,
    },
    chevronWrap: {
      width: 28,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
