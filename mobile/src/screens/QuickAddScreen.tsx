import React, { useCallback, useEffect, useReducer, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as api from '../api/client';
import { API_ORIGIN } from '../config';
import { GlassButton, GlassCard, ScreenBackground } from '../components/Glass';
import { useTheme, useThemedStyles, type ThemeContextValue } from '../context/ThemeContext';
import type { AppStackParamList } from '../navigation/RootNavigator';
import { radii, spacing, typography } from '../theme';
import { imagePickerAssetToUpload } from '../utils/imageUpload';
import { STACK_SCREEN_SCROLL_BOTTOM, stackScrollContentPaddingTop } from '../utils/screenSpacing';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  QUICK_ADD_LIMIT,
  itemLabel,
  nextToUpload,
  quickAddReducer,
  quickAddSummary,
  type QuickAddEntry,
} from '../utils/quickAddQueue';

type Nav = NativeStackNavigationProp<AppStackParamList, 'QuickAdd'>;
type Entry = QuickAddEntry<ImagePicker.ImagePickerAsset>;

const TIPS = [
  'One piece per photo',
  'Lay it flat or hang it up; a plain background works best',
  `Up to ${QUICK_ADD_LIMIT} photos at a time`,
];

export function QuickAddScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [entries, dispatch] = useReducer(quickAddReducer<ImagePicker.ImagePickerAsset>, [] as Entry[]);
  const summary = quickAddSummary(entries);
  const running = useRef(false);

  const pick = useCallback(async () => {
    const lib = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!lib.granted) {
      Alert.alert('Photo access needed', 'Allow photo library access to add clothes from your photos.');
      return;
    }
    const room = QUICK_ADD_LIMIT - entries.length;
    if (room <= 0) return;
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsMultipleSelection: true,
      selectionLimit: room,
      preferredAssetRepresentationMode:
        ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    });
    if (picked.canceled || !picked.assets?.length) return;
    dispatch({ type: 'add', assets: picked.assets.map((a) => ({ asset: a, previewUri: a.uri })) });
  }, [entries.length]);

  // Upload one waiting photo at a time.
  useEffect(() => {
    const next = nextToUpload(entries);
    if (!next || running.current) return;
    running.current = true;
    dispatch({ type: 'start', key: next.key });
    (async () => {
      try {
        const photo = await imagePickerAssetToUpload(next.asset, 'item');
        const res = await api.uploadClothing([photo]);
        dispatch({
          type: 'succeed',
          key: next.key,
          itemId: res.item_id,
          label: itemLabel(res.classification as { category?: string; colors?: string[] }),
          thumbUri: res.thumbnail_url ? `${API_ORIGIN}${res.thumbnail_url}` : undefined,
        });
      } catch (e) {
        dispatch({ type: 'fail', key: next.key, error: e instanceof Error ? e.message : 'Upload failed' });
      } finally {
        running.current = false;
      }
    })();
  }, [entries]);

  // Leaving mid-batch would drop the photos still waiting; ask first.
  useEffect(
    () =>
      navigation.addListener('beforeRemove', (e) => {
        if (summary.pending === 0) return;
        e.preventDefault();
        Alert.alert(
          'Stop adding?',
          `${summary.pending} photo${summary.pending === 1 ? ' is' : 's are'} still waiting. Pieces already added stay in your closet.`,
          [
            { text: 'Keep adding', style: 'cancel' },
            { text: 'Stop', style: 'destructive', onPress: () => navigation.dispatch(e.data.action) },
          ]
        );
      }),
    [navigation, summary.pending]
  );

  const openItem = async (itemId: number) => {
    try {
      const item = await api.fetchItem(itemId);
      navigation.navigate('ItemDetail', { item });
    } catch {
      // Item view is a convenience; ignore if it can't load.
    }
  };

  const progress = summary.total ? (summary.done + summary.failed) / summary.total : 0;

  return (
    <View style={{ flex: 1 }}>
      <ScreenBackground />
      <ScrollView
        contentContainerStyle={[styles.container, { paddingTop: stackScrollContentPaddingTop(insets) }]}
        showsVerticalScrollIndicator={false}
      >
        {entries.length === 0 ? (
          <GlassCard padded style={styles.intro}>
            <Ionicons name="images-outline" size={34} color={colors.accent} />
            <Text style={styles.title}>Add a stack of clothes at once</Text>
            <Text style={styles.body}>
              Pick photos from your library and each one becomes a closet item, sorted by type and color
              for you.
            </Text>
            <View style={styles.tips}>
              {TIPS.map((t) => (
                <View key={t} style={styles.tipRow}>
                  <Ionicons name="checkmark" size={16} color={colors.accent} />
                  <Text style={styles.tip}>{t}</Text>
                </View>
              ))}
            </View>
            <GlassButton title="Choose photos" onPress={pick} fullWidth testID="quick-add-pick" />
          </GlassCard>
        ) : (
          <>
            <Text style={styles.status} accessibilityLiveRegion="polite">
              {summary.finished
                ? `${summary.done} piece${summary.done === 1 ? '' : 's'} added`
                : `Adding ${summary.done + summary.failed + 1} of ${summary.total}…`}
              {summary.failed ? ` · ${summary.failed} failed` : ''}
            </Text>
            <View style={styles.bar}>
              <View style={[styles.barFill, { width: `${Math.round(progress * 100)}%` }]} />
            </View>

            <View style={styles.grid}>
              {entries.map((e) => (
                <Pressable
                  key={e.key}
                  style={styles.cell}
                  disabled={!(e.status === 'done' || e.status === 'failed')}
                  onPress={() =>
                    e.status === 'done' && e.itemId
                      ? openItem(e.itemId)
                      : dispatch({ type: 'retry', key: e.key })
                  }
                  accessibilityLabel={
                    e.status === 'done' ? e.label : e.status === 'failed' ? 'Failed, tap to retry' : 'Waiting'
                  }
                >
                  <View style={styles.thumb}>
                    <Image
                      source={{ uri: e.thumbUri ?? e.previewUri }}
                      style={[styles.thumbImg, e.status !== 'done' && styles.thumbDim]}
                      resizeMode={e.thumbUri ? 'contain' : 'cover'}
                    />
                    {e.status === 'uploading' ? (
                      <ActivityIndicator style={styles.badge} color="#fff" />
                    ) : e.status === 'done' ? (
                      <Ionicons style={styles.badge} name="checkmark-circle" size={22} color={colors.success} />
                    ) : e.status === 'failed' ? (
                      <Ionicons style={styles.badge} name="refresh-circle" size={24} color={colors.danger} />
                    ) : null}
                  </View>
                  <Text style={styles.label} numberOfLines={1}>
                    {e.status === 'done' ? e.label : e.status === 'failed' ? 'Tap to retry' : ' '}
                  </Text>
                </Pressable>
              ))}
            </View>

            {summary.finished ? (
              <View style={styles.actions}>
                <GlassButton
                  title="See today's outfit"
                  fullWidth
                  onPress={() => navigation.navigate('MainTabs', { screen: 'TodayTab' })}
                  testID="quick-add-done"
                />
                {summary.failed ? (
                  <GlassButton title="Retry failed" variant="secondary" onPress={() => dispatch({ type: 'retryFailed' })} />
                ) : null}
                {entries.length < QUICK_ADD_LIMIT ? (
                  <GlassButton title="Add more photos" variant="ghost" onPress={pick} />
                ) : null}
              </View>
            ) : (
              <Text style={styles.hint}>
                Keep this screen open while they upload. Tap a finished piece to fix its details.
              </Text>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function makeStyles({ colors, surface }: ThemeContextValue) {
  return StyleSheet.create({
    container: { paddingHorizontal: spacing.lg, paddingBottom: STACK_SCREEN_SCROLL_BOTTOM },
    intro: { gap: spacing.md, alignItems: 'flex-start' },
    title: { ...typography.title, color: colors.text },
    body: { ...typography.body, color: colors.textSecondary },
    tips: { gap: 6, marginVertical: spacing.sm },
    tipRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    tip: { ...typography.callout, color: colors.text },
    status: { ...typography.headline, color: colors.text, marginBottom: spacing.sm },
    bar: { height: 6, borderRadius: 3, backgroundColor: surface.chipInactive, overflow: 'hidden' },
    barFill: { height: 6, borderRadius: 3, backgroundColor: colors.accent },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.lg },
    cell: { width: '31.5%' },
    thumb: {
      aspectRatio: 1,
      borderRadius: radii.md,
      overflow: 'hidden',
      backgroundColor: surface.thumbBg,
    },
    thumbImg: { width: '100%', height: '100%' },
    thumbDim: { opacity: 0.55 },
    badge: { position: 'absolute', right: 6, top: 6 },
    label: { ...typography.caption, color: colors.textSecondary, marginTop: 4 },
    actions: { gap: spacing.sm, marginTop: spacing.xl },
    hint: { ...typography.callout, color: colors.textMuted, marginTop: spacing.lg, textAlign: 'center' },
  });
}
