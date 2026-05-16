import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as api from '../api/client';
import type { ClosetLocation } from '../api/types';
import { Avatar } from '../components/Avatar';
import { GlassButton, GlassCard, ScreenBackground } from '../components/Glass';
import { useAuth } from '../context/AuthContext';
import {
  useTheme,
  useThemedStyles,
  type ThemeContextValue,
} from '../context/ThemeContext';
import type { AppStackParamList } from '../navigation/RootNavigator';
import {
  cycleDensity,
  cycleSort,
  densityDescription,
  densityLabel,
  layoutDescription,
  layoutLabel,
  sortDescription,
  sortLabel,
  useDensityPref,
  useLayoutPref,
  useSortPref,
} from '../preferences';
import { imagePickerAssetToUpload } from '../utils/imageUpload';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  stackScrollContentPaddingTop,
  STACK_SCREEN_SCROLL_BOTTOM,
} from '../utils/screenSpacing';
import {
  radii,
  spacing,
  typography,
  type ThemeColors,
  type ThemePref,
  type ThemeSurface,
} from '../theme';
import {
  getLocationPermissionLabel,
  getWeatherSyncEnabled,
  requestCurrentCoordinates,
  setWeatherSyncEnabled,
} from '../weather';

type Props = NativeStackScreenProps<AppStackParamList, 'PersonalSettings'>;

const THEME_OPTIONS: { value: ThemePref; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

const LOCATION_KINDS = ['home', 'school', 'parent', 'work', 'storage', 'other'];

export function PersonalSettingsScreen({}: Props) {
  const insets = useSafeAreaInsets();
  const scrollTop = stackScrollContentPaddingTop(insets);
  const { user, refreshUser } = useAuth();
  const { colors, pref, setPref } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [density, setDensity] = useDensityPref();
  const [sort, setSort] = useSortPref();
  const [layout, setLayout] = useLayoutPref();

  const [name, setName] = useState(user?.full_name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [socialEnabled, setSocialEnabled] = useState(user?.social_enabled ?? true);
  const [weatherSync, setWeatherSync] = useState(false);
  const [weatherPermission, setWeatherPermission] = useState('Unknown');

  const [locations, setLocations] = useState<ClosetLocation[]>([]);
  const [newLocation, setNewLocation] = useState('');
  const [newKind, setNewKind] = useState('home');
  const [busyLocationId, setBusyLocationId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const [settings, locs, weather, perm] = await Promise.all([
        api.fetchSettings(),
        api.fetchClosetLocations(),
        getWeatherSyncEnabled(),
        getLocationPermissionLabel(),
      ]);
      setSocialEnabled(settings.social_enabled);
      setLocations(locs.locations);
      setWeatherSync(weather);
      setWeatherPermission(perm);
    } catch (e) {
      Alert.alert('Could not load settings', e instanceof Error ? e.message : 'Error');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setName(user?.full_name ?? '');
    setEmail(user?.email ?? '');
    setBio(user?.bio ?? '');
    setSocialEnabled(user?.social_enabled ?? true);
  }, [user]);

  async function saveProfile() {
    if (savingProfile) return;
    setSavingProfile(true);
    try {
      await api.updateProfile({
        full_name: name.trim() || null,
        email: email.trim() || null,
        bio: bio.trim() || null,
      });
      await refreshUser();
      Alert.alert('Saved', 'Your account details were updated.');
    } catch (e) {
      Alert.alert('Could not save profile', e instanceof Error ? e.message : 'Error');
    } finally {
      setSavingProfile(false);
    }
  }

  async function pickAvatar() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo access to change your profile picture.');
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });
    if (picked.canceled || !picked.assets?.[0]) return;
    setUploadingAvatar(true);
    try {
      const upload = await imagePickerAssetToUpload(picked.assets[0], 'avatar');
      await api.uploadAvatar(upload);
      await refreshUser();
    } catch (e) {
      Alert.alert('Could not update avatar', e instanceof Error ? e.message : 'Error');
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function changeTheme(next: ThemePref) {
    await setPref(next);
    try {
      await api.updateSettings({ theme_preference: next });
      await refreshUser();
    } catch {
      // Local theme preference still applies if server sync fails.
    }
  }

  async function toggleSocial() {
    const next = !socialEnabled;
    setSocialEnabled(next);
    try {
      await api.updateSettings({ social_enabled: next });
      await refreshUser();
    } catch (e) {
      setSocialEnabled(!next);
      Alert.alert('Could not update social mode', e instanceof Error ? e.message : 'Error');
    }
  }

  async function toggleWeather() {
    const next = !weatherSync;
    if (next) {
      try {
        await requestCurrentCoordinates();
      } catch (e) {
        Alert.alert('Location not enabled', e instanceof Error ? e.message : 'Error');
        setWeatherPermission(await getLocationPermissionLabel());
        return;
      }
    }
    setWeatherSync(next);
    await setWeatherSyncEnabled(next);
    setWeatherPermission(await getLocationPermissionLabel());
  }

  async function addLocation() {
    const name = newLocation.trim();
    if (!name) {
      Alert.alert('Name required', 'Give this closet location a name.');
      return;
    }
    try {
      await api.createClosetLocation({ name, kind: newKind });
      setNewLocation('');
      const res = await api.fetchClosetLocations();
      setLocations(res.locations);
    } catch (e) {
      Alert.alert('Could not add location', e instanceof Error ? e.message : 'Error');
    }
  }

  async function setDefaultLocation(location: ClosetLocation) {
    setBusyLocationId(location.id);
    try {
      await api.updateClosetLocation(location.id, { is_default: true });
      await api.updateSettings({ default_closet_location_id: location.id });
      await refreshUser();
      const res = await api.fetchClosetLocations();
      setLocations(res.locations);
    } catch (e) {
      Alert.alert('Could not update default', e instanceof Error ? e.message : 'Error');
    } finally {
      setBusyLocationId(null);
    }
  }

  async function removeLocation(location: ClosetLocation) {
    if (locations.length <= 1) {
      Alert.alert('Keep one location', 'You need at least one closet location.');
      return;
    }
    setBusyLocationId(location.id);
    try {
      const res = await api.deleteClosetLocation(location.id);
      setLocations(res.locations);
      await refreshUser();
    } catch (e) {
      Alert.alert('Could not delete location', e instanceof Error ? e.message : 'Error');
    } finally {
      setBusyLocationId(null);
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <ScreenBackground />
        <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingTop: scrollTop },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.heading}>Personal Settings</Text>
        <Text style={styles.blurb}>
          Account, layout, social mode, and the places your closet lives.
        </Text>

        <GlassCard padded style={styles.card}>
          <View style={styles.avatarRow}>
            <Avatar
              url={user?.avatar_url}
              name={user?.full_name}
              username={user?.username}
              size={64}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Account</Text>
              <Text style={styles.hint}>Edit your private account details.</Text>
            </View>
            <GlassButton
              title="Photo"
              onPress={pickAvatar}
              loading={uploadingAvatar}
              fullWidth={false}
              variant="secondary"
            />
          </View>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Display name"
            placeholderTextColor={colors.placeholder}
            style={styles.input}
          />
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="Email"
            placeholderTextColor={colors.placeholder}
            keyboardType="email-address"
            autoCapitalize="none"
            style={styles.input}
          />
          <TextInput
            value={bio}
            onChangeText={setBio}
            placeholder="Bio"
            placeholderTextColor={colors.placeholder}
            multiline
            style={[styles.input, styles.bioInput]}
          />
          <GlassButton title="Save account" onPress={saveProfile} loading={savingProfile} />
        </GlassCard>

        <GlassCard padded style={styles.card}>
          <Text style={styles.cardTitle}>Closet view</Text>
          <Text style={styles.hint}>
            Applies on the Closet tab. Tap a row to cycle through options.
          </Text>
          <View style={styles.cycleRowsWrap}>
            <ClosetPrefCycleRow
              styles={styles}
              colors={colors}
              title="Grid density"
              currentLabel={densityLabel(density)}
              description={densityDescription(density)}
              onPress={() => setDensity(cycleDensity(density))}
            />
            <ClosetPrefCycleRow
              styles={styles}
              colors={colors}
              title="Default sort"
              currentLabel={sortLabel(sort)}
              description={sortDescription(sort)}
              onPress={() => setSort(cycleSort(sort))}
            />
            <ClosetPrefCycleRow
              styles={styles}
              colors={colors}
              title="Browse layout"
              currentLabel={layoutLabel(layout)}
              description={layoutDescription(layout)}
              onPress={() => setLayout(layout === 'grid' ? 'rails' : 'grid')}
              isLast
            />
          </View>
        </GlassCard>

        <GlassCard padded style={styles.card}>
          <Text style={styles.cardTitle}>Experience</Text>
          <Text style={styles.hint}>
            {socialEnabled
              ? 'Social features are visible: Feed, fits, friends, and profiles.'
              : 'Closet-only mode is on: social-first surfaces are hidden.'}
          </Text>
          <GlassButton
            title={socialEnabled ? 'Switch to closet-only mode' : 'Turn social features back on'}
            onPress={toggleSocial}
            variant={socialEnabled ? 'secondary' : 'primary'}
            style={{ marginTop: spacing.md }}
          />
          <Text style={[styles.hint, { marginTop: spacing.md }]}>
            Weather sync is {weatherSync ? 'on' : 'off'} - location {weatherPermission.toLowerCase()}.
          </Text>
          <GlassButton
            title={weatherSync ? 'Turn off weather sync' : 'Turn on weather sync'}
            onPress={toggleWeather}
            variant="secondary"
            style={{ marginTop: spacing.md }}
          />
        </GlassCard>

        <GlassCard padded style={styles.card}>
          <Text style={styles.cardTitle}>Closet Locations</Text>
          <Text style={styles.hint}>
            Use locations like Home, Dorm, Mom's house, Dad's house, or Work.
          </Text>
          {locations.map((loc) => (
            <View key={loc.id} style={styles.locationRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.locationName}>
                  {loc.name} {loc.is_default ? '(default)' : ''}
                </Text>
                <Text style={styles.locationKind}>{loc.kind || 'other'}</Text>
              </View>
              {!loc.is_default ? (
                <Pressable
                  onPress={() => setDefaultLocation(loc)}
                  disabled={busyLocationId === loc.id}
                  style={styles.iconBtn}
                >
                  <Ionicons name="star-outline" size={18} color={colors.accent} />
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => removeLocation(loc)}
                disabled={busyLocationId === loc.id}
                style={styles.iconBtn}
              >
                <Ionicons name="trash-outline" size={18} color={colors.danger} />
              </Pressable>
            </View>
          ))}
          <TextInput
            value={newLocation}
            onChangeText={setNewLocation}
            placeholder="New location name"
            placeholderTextColor={colors.placeholder}
            style={styles.input}
          />
          <View style={styles.kindRow}>
            {LOCATION_KINDS.map((kind) => (
              <Pressable
                key={kind}
                onPress={() => setNewKind(kind)}
                style={[
                  styles.kindChip,
                  newKind === kind && { backgroundColor: colors.accent },
                ]}
              >
                <Text style={[styles.kindText, newKind === kind && { color: '#fff' }]}>
                  {kind}
                </Text>
              </Pressable>
            ))}
          </View>
          <GlassButton title="Add location" onPress={addLocation} style={{ marginTop: spacing.md }} />
        </GlassCard>
      </ScrollView>
    </View>
  );
}

function ClosetPrefCycleRow({
  styles,
  colors,
  title,
  currentLabel,
  description,
  onPress,
  isLast,
}: {
  styles: ReturnType<typeof makeStyles>;
  colors: ThemeColors;
  title: string;
  currentLabel: string;
  description: string;
  onPress: () => void;
  isLast?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.cycleRow,
        isLast && styles.cycleRowLast,
        { opacity: pressed ? 0.88 : 1 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${title}: ${currentLabel}`}
      accessibilityHint="Cycles to the next option"
    >
      <View style={styles.cycleRowText}>
        <Text style={styles.cycleRowKicker}>{title}</Text>
        <Text style={styles.cycleRowValue}>{currentLabel}</Text>
        <Text style={styles.cycleRowDesc}>{description}</Text>
      </View>
      <Ionicons name="swap-horizontal" size={22} color={colors.accent} />
    </Pressable>
  );
}

function makeStyles({ colors, surface, mode }: ThemeContextValue) {
  return StyleSheet.create({
    container: {
      paddingHorizontal: spacing.lg,
      paddingBottom: STACK_SCREEN_SCROLL_BOTTOM,
    },
    heading: {
      ...typography.title,
      color: colors.text,
      marginBottom: spacing.xs,
    },
    blurb: {
      ...typography.callout,
      color: colors.textSecondary,
      marginBottom: spacing.xl,
      lineHeight: 22,
    },
    card: {
      marginBottom: spacing.lg,
    },
    avatarRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      marginBottom: spacing.md,
    },
    cardTitle: {
      ...typography.headline,
      color: colors.text,
    },
    hint: {
      ...typography.caption,
      color: colors.textSecondary,
      marginTop: spacing.sm,
      lineHeight: 20,
    },
    input: {
      marginTop: spacing.md,
      borderRadius: radii.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: surface.inputBorder,
      backgroundColor: surface.inputOverlay,
      color: colors.text,
      paddingHorizontal: spacing.md,
      paddingVertical: 11,
      fontSize: 15,
    },
    bioInput: {
      minHeight: 82,
      textAlignVertical: 'top',
    },
    cycleRowsWrap: {
      marginTop: spacing.md,
    },
    cycleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: surface.cardBorder,
      gap: spacing.md,
    },
    cycleRowLast: {
      borderBottomWidth: 0,
    },
    cycleRowText: {
      flex: 1,
      minWidth: 0,
    },
    cycleRowKicker: {
      ...typography.micro,
      color: colors.textSecondary,
      marginBottom: 4,
    },
    cycleRowValue: {
      ...typography.bodyMedium,
      fontSize: 17,
      color: colors.text,
    },
    cycleRowDesc: {
      ...typography.caption,
      color: colors.textMuted,
      marginTop: 6,
      lineHeight: 19,
    },
    locationRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: surface.cardBorder,
    },
    locationName: {
      ...typography.bodyMedium,
      color: colors.text,
    },
    locationKind: {
      ...typography.caption,
      color: colors.textSecondary,
      marginTop: 2,
      textTransform: 'capitalize',
    },
    iconBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: surface.chipInactive,
    },
    kindRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    kindChip: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: radii.pill,
      backgroundColor: surface.chipInactive,
      borderWidth: mode === 'light' ? 0 : StyleSheet.hairlineWidth,
      borderColor: surface.chipInactiveBorder,
    },
    kindText: {
      ...typography.caption,
      color: colors.text,
      textTransform: 'capitalize',
    },
  });
}
