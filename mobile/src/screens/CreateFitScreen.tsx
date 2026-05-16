import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
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
import type { AppStackParamList } from '../navigation/RootNavigator';
import * as api from '../api/client';
import type { ClothingItem } from '../api/types';
import { itemThumbnailUrl } from '../config';
import { imagePickerAssetToUpload } from '../utils/imageUpload';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  stackScrollContentPaddingTop,
  STACK_SCREEN_SCROLL_BOTTOM,
} from '../utils/screenSpacing';
import {
  GlassButton,
  GlassCard,
  GlassInputContainer,
  ScreenBackground,
} from '../components/Glass';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import {
  radii,
  shadow,
  spacing,
  typography,
  type ThemeColors,
  type ThemeSurface,
} from '../theme';

type Props = NativeStackScreenProps<AppStackParamList, 'CreateFit'>;

export function CreateFitScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const scrollTop = stackScrollContentPaddingTop(insets);
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const tripParams = route.params;
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [mime, setMime] = useState<string>('image/jpeg');
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [closetItems, setClosetItems] = useState<ClothingItem[]>([]);
  const [closetLoading, setClosetLoading] = useState(true);
  const [tagged, setTagged] = useState<Set<number>>(() => new Set());

  const loadCloset = useCallback(async () => {
    setClosetLoading(true);
    try {
      const data = await api.fetchCloset();
      const owned = data.items.filter((i) => i.status !== 'wishlist');
      const sorted = tripParams?.packedOnly
        ? [
            ...owned.filter((i) => i.packed_for_trip),
            ...owned.filter((i) => !i.packed_for_trip),
          ]
        : owned;
      setClosetItems(sorted);
    } catch {
      // Tagging is optional — skip if we can't load.
    } finally {
      setClosetLoading(false);
    }
  }, [tripParams?.packedOnly]);

  useEffect(() => {
    loadCloset();
  }, [loadCloset]);

  async function pickFromLibrary() {
    setError(null);
    const lib = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!lib.granted) {
      setError('Photo library permission is required.');
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      preferredAssetRepresentationMode:
        ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    });
    if (picked.canceled || !picked.assets?.[0]) return;
    try {
      const photo = await imagePickerAssetToUpload(picked.assets[0], 'fit');
      setImageUri(photo.uri);
      setMime(photo.mimeType);
    } catch {
      setError('Could not prepare that photo. Try another image or take a new one.');
    }
  }

  async function takePhoto() {
    setError(null);
    const cam = await ImagePicker.requestCameraPermissionsAsync();
    if (!cam.granted) {
      setError('Camera permission is required.');
      return;
    }
    const picked = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.85,
    });
    if (picked.canceled || !picked.assets?.[0]) return;
    try {
      const photo = await imagePickerAssetToUpload(picked.assets[0], 'fit');
      setImageUri(photo.uri);
      setMime(photo.mimeType);
    } catch {
      setError('Could not prepare that photo. Try another image or take a new one.');
    }
  }

  function toggleTag(itemId: number) {
    setTagged((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  async function submit() {
    if (!imageUri || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.createFitPost({
        uri: imageUri,
        filename: `fit.${mime.includes('png') ? 'png' : 'jpg'}`,
        mimeType: mime,
        caption: caption.trim() || null,
        itemIds: [...tagged],
        tripName: tripParams?.tripName,
        tripDestination: tripParams?.tripDestination,
        tripStart: tripParams?.tripStart,
        tripEnd: tripParams?.tripEnd,
      });
      navigation.replace('FitDetail', { postId: res.post.id });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not post');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <ScreenBackground />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={[styles.container, { paddingTop: scrollTop }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.heading}>Daily fit check</Text>
          <Text style={styles.blurb}>
            {tripParams?.tripName
              ? `Snap a fit for ${tripParams.tripName}. Packed items appear first.`
              : "Snap or pick today's fit. Tag items from your closet and your friends will see it in their feed."}
          </Text>

          {tripParams?.tripName ? (
            <GlassCard padded style={styles.tripCard}>
              <View style={styles.tripHeader}>
                <Ionicons name="airplane-outline" size={18} color={colors.accent} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.tripTitle}>{tripParams.tripName}</Text>
                  <Text style={styles.tripMeta}>
                    {[tripParams.tripDestination, tripParams.tripStart, tripParams.tripEnd]
                      .filter(Boolean)
                      .join(' · ') || 'Trip outfit log'}
                  </Text>
                </View>
              </View>
            </GlassCard>
          ) : null}

          {imageUri ? (
            <Pressable onPress={pickFromLibrary} style={styles.previewWrap}>
              <Image source={{ uri: imageUri }} style={styles.preview} />
              <View style={styles.previewOverlay}>
                <Ionicons name="camera-reverse-outline" size={18} color="#fff" />
                <Text style={styles.previewOverlayText}>Change</Text>
              </View>
            </Pressable>
          ) : (
            <View style={styles.placeholder}>
              <Ionicons name="image-outline" size={32} color={colors.textMuted} />
              <Text style={styles.placeholderText}>
                Pick or take a photo to start
              </Text>
            </View>
          )}

          <GlassCard padded={false} style={styles.actionCard}>
            <View style={styles.actionRow}>
              <GlassButton
                title="Pick photo"
                onPress={pickFromLibrary}
                style={styles.flexBtn}
                disabled={busy}
              />
              <GlassButton
                title="Take photo"
                onPress={takePhoto}
                variant="ghost"
                style={styles.flexBtn}
                disabled={busy}
              />
            </View>
          </GlassCard>

          <Text style={styles.sectionLabel}>Caption</Text>
          <GlassInputContainer style={styles.captionShell}>
            <TextInput
              value={caption}
              onChangeText={setCaption}
              placeholder="What's the vibe today?"
              placeholderTextColor={colors.placeholder}
              multiline
              maxLength={2000}
              style={styles.captionInput}
            />
          </GlassInputContainer>

          <Text style={styles.sectionLabel}>
            Tag items {tagged.size > 0 ? `· ${tagged.size}` : ''}
          </Text>
          {closetLoading ? (
            <ActivityIndicator color={colors.accent} style={{ marginTop: 8 }} />
          ) : closetItems.length === 0 ? (
            <Text style={styles.emptyHint}>
              No closet items yet. You can post without tagging.
            </Text>
          ) : (
            <FlatList
              horizontal
              data={closetItems}
              keyExtractor={(it) => String(it.id)}
              contentContainerStyle={styles.itemRow}
              showsHorizontalScrollIndicator={false}
              renderItem={({ item }) => {
                const selected = tagged.has(item.id);
                const uri = itemThumbnailUrl(item);
                return (
                  <Pressable
                    onPress={() => toggleTag(item.id)}
                    style={({ pressed }) => [
                      styles.itemCard,
                      selected && styles.itemCardActive,
                      { transform: [{ scale: pressed ? 0.97 : 1 }] },
                    ]}
                  >
                    {uri ? (
                      <Image source={{ uri }} style={styles.itemThumb} />
                    ) : (
                      <View style={[styles.itemThumb, styles.itemPlaceholder]} />
                    )}
                    {selected ? (
                      <View style={styles.checkBadge}>
                        <Ionicons name="checkmark" size={14} color="#fff" />
                      </View>
                    ) : null}
                    <Text style={styles.itemLabel} numberOfLines={1}>
                      {item.subcategory || item.category}
                    </Text>
                  </Pressable>
                );
              }}
            />
          )}

          {error ? (
            <View style={styles.errorBox}>
              <Ionicons
                name="alert-circle"
                size={18}
                color={colors.danger}
                style={{ marginRight: 8 }}
              />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <GlassButton
            title={busy ? 'Posting…' : 'Post fit'}
            onPress={submit}
            disabled={!imageUri || busy}
            loading={busy}
            style={styles.submitBtn}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function makeStyles({
  colors,
  surface,
}: {
  colors: ThemeColors;
  surface: ThemeSurface;
}) {
  return StyleSheet.create({
    container: {
      paddingHorizontal: spacing.xl,
      paddingBottom: STACK_SCREEN_SCROLL_BOTTOM,
    },
    heading: {
      ...typography.title,
      color: colors.text,
      marginBottom: 6,
    },
    blurb: {
      ...typography.callout,
      color: colors.textSecondary,
      marginBottom: spacing.lg,
      lineHeight: 22,
    },
    previewWrap: {
      width: '100%',
      aspectRatio: 4 / 5,
      borderRadius: radii.lg,
      overflow: 'hidden',
      marginBottom: spacing.lg,
      ...shadow.card,
    },
    preview: {
      width: '100%',
      height: '100%',
      backgroundColor: surface.thumbBg,
    },
    previewOverlay: {
      position: 'absolute',
      bottom: 12,
      right: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: radii.pill,
      backgroundColor: 'rgba(0,0,0,0.55)',
    },
    previewOverlayText: {
      color: '#fff',
      fontWeight: '600',
      fontSize: 12,
    },
    placeholder: {
      width: '100%',
      aspectRatio: 4 / 5,
      borderRadius: radii.lg,
      backgroundColor: surface.thumbBg,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: surface.cardBorder,
    },
    placeholderText: {
      color: colors.textMuted,
      marginTop: 8,
    },
    actionCard: {
      padding: spacing.md,
      marginBottom: spacing.lg,
    },
    actionRow: {
      flexDirection: 'row',
      gap: spacing.md,
      paddingVertical: 4,
    },
    flexBtn: { flex: 1 },
    tripCard: {
      marginBottom: spacing.lg,
    },
    tripHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    tripTitle: {
      ...typography.bodyMedium,
      color: colors.text,
    },
    tripMeta: {
      ...typography.caption,
      color: colors.textSecondary,
      marginTop: 2,
    },
    sectionLabel: {
      ...typography.micro,
      color: colors.textSecondary,
      marginBottom: spacing.sm,
      marginLeft: 4,
    },
    captionShell: {
      minHeight: 100,
      marginBottom: spacing.lg,
    },
    captionInput: {
      paddingHorizontal: 14,
      paddingVertical: 12,
      color: colors.text,
      fontSize: 15,
      minHeight: 100,
      textAlignVertical: 'top',
    },
    itemRow: {
      gap: spacing.sm,
      paddingBottom: spacing.lg,
    },
    itemCard: {
      width: 92,
      alignItems: 'center',
      padding: 6,
      borderRadius: radii.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: surface.chipInactiveBorder,
      backgroundColor: surface.chipInactive,
    },
    itemCardActive: {
      borderColor: colors.accent,
      backgroundColor: colors.accentSoft,
    },
    itemThumb: {
      width: 80,
      height: 80,
      borderRadius: radii.sm,
      backgroundColor: surface.thumbBg,
    },
    itemPlaceholder: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkBadge: {
      position: 'absolute',
      top: 4,
      right: 4,
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    itemLabel: {
      fontSize: 11,
      color: colors.textSecondary,
      marginTop: 5,
      textAlign: 'center',
    },
    emptyHint: {
      color: colors.textMuted,
      marginBottom: spacing.lg,
    },
    submitBtn: {
      marginTop: spacing.lg,
    },
    errorBox: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      backgroundColor: colors.dangerSoft,
      borderRadius: radii.md,
      marginBottom: spacing.md,
    },
    errorText: { color: colors.danger, fontSize: 14, flex: 1 },
  });
}
