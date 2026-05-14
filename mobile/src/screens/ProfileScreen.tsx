import React from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import { API_ORIGIN } from '../config';
import { GlassButton, GlassCard, ScreenBackground } from '../components/Glass';
import {
  radii,
  spacing,
  typography,
  type ThemeColors,
  type ThemeSurface,
  type ThemePref,
} from '../theme';

type ThemeOption = {
  value: ThemePref;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
};

const THEME_OPTIONS: ThemeOption[] = [
  { value: 'system', label: 'System', icon: 'phone-portrait-outline' },
  { value: 'light', label: 'Light', icon: 'sunny-outline' },
  { value: 'dark', label: 'Dark', icon: 'moon-outline' },
];

export function ProfileScreen() {
  const { user, signOut } = useAuth();
  const { colors, surface, pref, mode, setPref } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const initials = (user?.full_name || user?.username || '?')
    .split(' ')
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <View style={{ flex: 1 }}>
      <ScreenBackground />
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.heading}>Profile</Text>

        <GlassCard padded style={styles.card}>
          <View style={styles.identityRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            <View style={{ flex: 1, marginLeft: spacing.md }}>
              <Text style={styles.name}>
                {user?.full_name || user?.username}
              </Text>
              <Text style={styles.meta}>{user?.email}</Text>
            </View>
          </View>
        </GlassCard>

        <Text style={styles.sectionLabel}>Appearance</Text>
        <GlassCard padded style={styles.card}>
          <View style={styles.rowHeader}>
            <Ionicons
              name="color-palette-outline"
              size={18}
              color={colors.accent}
              style={{ marginRight: 8 }}
            />
            <Text style={styles.rowTitle}>Theme</Text>
          </View>
          <Text style={styles.hint}>
            {pref === 'system'
              ? `Following system · currently ${mode}`
              : `Always ${pref}`}
          </Text>

          <View style={styles.segment}>
            {THEME_OPTIONS.map((opt) => {
              const active = pref === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => setPref(opt.value)}
                  style={({ pressed }) => [
                    styles.segmentBtn,
                    {
                      backgroundColor: active
                        ? colors.accent
                        : surface.chipInactive,
                      borderColor: active
                        ? colors.accent
                        : surface.chipInactiveBorder,
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}
                >
                  <Ionicons
                    name={opt.icon}
                    size={16}
                    color={active ? '#fff' : colors.text}
                    style={{ marginRight: 6 }}
                  />
                  <Text
                    style={[
                      styles.segmentText,
                      { color: active ? '#fff' : colors.text },
                    ]}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </GlassCard>

        <Text style={styles.sectionLabel}>Connection</Text>
        <GlassCard padded style={styles.card}>
          <View style={styles.rowHeader}>
            <Ionicons
              name="cloud-outline"
              size={18}
              color={colors.accent}
              style={{ marginRight: 8 }}
            />
            <Text style={styles.rowTitle}>API server</Text>
          </View>
          <Text style={styles.api}>{API_ORIGIN}</Text>
          <Text style={styles.hint}>
            Set EXPO_PUBLIC_API_URL when starting Expo if this device cannot
            reach localhost (e.g. http://192.168.x.x:8000).
          </Text>
        </GlassCard>

        <GlassButton
          title="Sign out"
          onPress={signOut}
          variant="danger"
          style={styles.signOut}
        />
      </ScrollView>
    </View>
  );
}

const HEADER_PAD = Platform.OS === 'ios' ? 64 : 32;

function makeStyles({
  colors,
}: {
  colors: ThemeColors;
  surface: ThemeSurface;
}) {
  return StyleSheet.create({
    container: {
      paddingHorizontal: spacing.xl,
      paddingTop: HEADER_PAD,
      paddingBottom: 120,
    },
    heading: {
      ...typography.title,
      color: colors.text,
      marginBottom: spacing.lg,
    },
    card: {
      padding: spacing.lg,
      marginBottom: spacing.md,
    },
    identityRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    avatar: {
      width: 56,
      height: 56,
      borderRadius: radii.pill,
      backgroundColor: colors.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.accent,
      letterSpacing: 0.5,
    },
    name: {
      ...typography.headline,
      color: colors.text,
    },
    meta: {
      fontSize: 14,
      color: colors.textSecondary,
      marginTop: 4,
    },
    sectionLabel: {
      ...typography.micro,
      color: colors.textSecondary,
      marginTop: spacing.lg,
      marginBottom: spacing.sm,
      marginLeft: 4,
    },
    rowHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 8,
    },
    rowTitle: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.text,
    },
    api: {
      fontSize: 14,
      color: colors.textSecondary,
      fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
      marginBottom: spacing.sm,
    },
    hint: {
      fontSize: 13,
      color: colors.textMuted,
      lineHeight: 18,
    },
    segment: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    segmentBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 10,
      paddingHorizontal: 8,
      borderRadius: radii.md,
      borderWidth: StyleSheet.hairlineWidth,
    },
    segmentText: {
      fontSize: 14,
      fontWeight: '600',
    },
    signOut: {
      marginTop: spacing.xl,
    },
  });
}
