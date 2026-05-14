import React from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { API_ORIGIN } from '../config';
import { GlassButton, GlassCard } from '../components/Glass';
import { colors, radii, spacing, typography } from '../theme';

export function ProfileScreen() {
  const { user, signOut } = useAuth();
  const initials = (user?.full_name || user?.username || '?')
    .split(' ')
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
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
  );
}

const HEADER_PAD = Platform.OS === 'ios' ? 64 : 32;

const styles = StyleSheet.create({
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
  signOut: {
    marginTop: spacing.xl,
  },
});
