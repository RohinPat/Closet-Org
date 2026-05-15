import React, { useState } from 'react';
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as api from '../api/client';
import type { UploadPhoto } from '../api/client';
import { GlassButton, GlassCard, ScreenBackground } from '../components/Glass';
import { API_ORIGIN } from '../config';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import {
  radii,
  shadow,
  spacing,
  typography,
  type ThemeColors,
  type ThemeSurface,
} from '../theme';

type Classification = {
  category?: string;
  subcategory?: string;
  style?: string;
  season?: string;
  colors?: string[];
};

type ResultState = {
  itemId: number;
  classification: Classification;
  previewUri: string;
};

const MAX_PHOTOS = 4;

function inferMime(uri: string): string {
  const lower = uri.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.heic') || lower.endsWith('.heif')) return 'image/heic';
  return 'image/jpeg';
}

function inferFilename(uri: string, mime: string): string {
  const base = uri.split('/').pop()?.split('?')[0];
  if (base && base.includes('.')) return base;
  const ext = mime.includes('png') ? 'png' : 'jpg';
  return `upload.${ext}`;
}

function assetToPhoto(asset: ImagePicker.ImagePickerAsset): UploadPhoto {
  const mime = asset.mimeType || inferMime(asset.uri);
  return {
    uri: asset.uri,
    filename: inferFilename(asset.uri, mime),
    mimeType: mime,
  };
}

export function UploadScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [photos, setPhotos] = useState<UploadPhoto[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ResultState | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setPhotos([]);
    setResult(null);
    setError(null);
  }

  async function pickFromLibrary() {
    setError(null);
    setResult(null);
    const lib = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!lib.granted) {
      setError('Photo library permission is required.');
      return;
    }
    const remaining = MAX_PHOTOS - photos.length;
    if (remaining <= 0) return;
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsMultipleSelection: true,
      selectionLimit: remaining,
    });
    if (picked.canceled || !picked.assets?.length) return;
    setPhotos((prev) => [...prev, ...picked.assets.map(assetToPhoto)].slice(0, MAX_PHOTOS));
  }

  async function takePhoto() {
    setError(null);
    setResult(null);
    const cam = await ImagePicker.requestCameraPermissionsAsync();
    if (!cam.granted) {
      setError('Camera permission is required.');
      return;
    }
    if (photos.length >= MAX_PHOTOS) return;
    const picked = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.85,
    });
    if (picked.canceled || !picked.assets?.[0]) return;
    setPhotos((prev) => [...prev, assetToPhoto(picked.assets[0])].slice(0, MAX_PHOTOS));
  }

  function removePhoto(idx: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== idx));
  }

  function makeFront(idx: number) {
    if (idx === 0) return;
    setPhotos((prev) => {
      const next = [...prev];
      const [picked] = next.splice(idx, 1);
      next.unshift(picked);
      return next;
    });
  }

  async function upload() {
    if (photos.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const data = await api.uploadClothing(photos);
      const previewUri = data.thumbnail_url
        ? `${API_ORIGIN}${data.thumbnail_url}`
        : photos[0].uri;
      setResult({
        itemId: data.item_id,
        classification: data.classification as Classification,
        previewUri,
      });
      setPhotos([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  const canAdd = photos.length < MAX_PHOTOS;

  return (
    <View style={{ flex: 1 }}>
      <ScreenBackground />
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.heading}>Add an item</Text>
        <Text style={styles.blurb}>
          Snap a photo of the front, then add a back shot for items with prints,
          logos, or rear details. We'll classify the front and merge the colors.
        </Text>

        {photos.length > 0 ? (
          <View style={styles.photoRow}>
            {photos.map((p, idx) => (
              <View key={`${p.uri}-${idx}`} style={styles.photoTile}>
                <Image source={{ uri: p.uri }} style={styles.photoImage} />
                {idx === 0 ? (
                  <View style={styles.frontBadge}>
                    <Text style={styles.frontBadgeText}>Front</Text>
                  </View>
                ) : (
                  <Pressable
                    onPress={() => makeFront(idx)}
                    style={styles.makeFrontBtn}
                  >
                    <Text style={styles.makeFrontText}>Make front</Text>
                  </Pressable>
                )}
                <Pressable
                  onPress={() => removePhoto(idx)}
                  style={styles.removeBtn}
                  hitSlop={8}
                >
                  <Ionicons name="close" size={14} color={colors.text} />
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        <GlassCard padded={false} style={styles.actionCard}>
          <View style={styles.actionRow}>
            <GlassButton
              title={canAdd ? 'Pick from library' : 'Limit reached'}
              onPress={pickFromLibrary}
              disabled={!canAdd || busy}
              style={styles.flexBtn}
            />
          </View>
          <View style={[styles.actionRow, { paddingTop: 0 }]}>
            <GlassButton
              title="Take photo"
              onPress={takePhoto}
              variant="ghost"
              disabled={!canAdd || busy}
              style={styles.flexBtn}
            />
          </View>
          {photos.length > 0 ? (
            <View style={[styles.actionRow, { paddingTop: 0 }]}>
              <GlassButton
                title={`Add ${photos.length} photo${photos.length === 1 ? '' : 's'} to closet`}
                onPress={upload}
                loading={busy}
                style={styles.flexBtn}
              />
            </View>
          ) : null}
        </GlassCard>

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

        {result ? (
          <GlassCard padded style={styles.resultCard}>
            <View style={styles.resultHeader}>
              <Image
                source={{ uri: result.previewUri }}
                style={styles.preview}
                resizeMode="contain"
              />
              <View style={{ flex: 1, marginLeft: spacing.md }}>
                <Text style={styles.savedTag}>Saved · #{result.itemId}</Text>
                <Text style={styles.resultTitle}>
                  {result.classification.category ?? 'Item'}
                </Text>
                <Text style={styles.resultSub}>
                  {result.classification.subcategory}
                </Text>
              </View>
            </View>

            <View style={styles.tagRow}>
              {result.classification.style ? (
                <View style={styles.tag}>
                  <Text style={styles.tagText}>
                    {result.classification.style}
                  </Text>
                </View>
              ) : null}
              {result.classification.season ? (
                <View style={styles.tag}>
                  <Text style={styles.tagText}>
                    {result.classification.season}
                  </Text>
                </View>
              ) : null}
              {(result.classification.colors ?? []).map((c) => (
                <View key={c} style={[styles.tag, styles.colorTag]}>
                  <Text style={styles.tagText}>{c}</Text>
                </View>
              ))}
            </View>

            <View style={[styles.actionRow, { paddingTop: spacing.md, paddingHorizontal: 0 }]}>
              <GlassButton
                title="Add another item"
                onPress={reset}
                variant="ghost"
                style={styles.flexBtn}
              />
            </View>
          </GlassCard>
        ) : null}
      </ScrollView>
    </View>
  );
}

const HEADER_PAD = Platform.OS === 'ios' ? 64 : 32;

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
      paddingTop: HEADER_PAD,
      paddingBottom: 120,
    },
    heading: {
      ...typography.title,
      color: colors.text,
      marginBottom: 6,
    },
    blurb: {
      ...typography.callout,
      color: colors.textSecondary,
      marginBottom: spacing.xl,
      lineHeight: 22,
    },
    actionCard: {
      padding: spacing.md,
    },
    actionRow: {
      flexDirection: 'row',
      gap: spacing.md,
      paddingVertical: 4,
    },
    flexBtn: { flex: 1 },
    photoRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.md,
      marginBottom: spacing.lg,
    },
    photoTile: {
      width: 92,
      height: 92,
      borderRadius: radii.md,
      backgroundColor: surface.thumbBg,
      overflow: 'hidden',
      ...shadow.card,
    },
    photoImage: {
      width: '100%',
      height: '100%',
    },
    frontBadge: {
      position: 'absolute',
      bottom: 6,
      left: 6,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: radii.pill,
      backgroundColor: colors.accent,
    },
    frontBadgeText: {
      ...typography.micro,
      color: '#fff',
      fontWeight: '700',
    },
    makeFrontBtn: {
      position: 'absolute',
      bottom: 6,
      left: 6,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: radii.pill,
      backgroundColor: 'rgba(0,0,0,0.55)',
    },
    makeFrontText: {
      ...typography.micro,
      color: '#fff',
      fontWeight: '600',
    },
    removeBtn: {
      position: 'absolute',
      top: 4,
      right: 4,
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: 'rgba(0,0,0,0.55)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    errorBox: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: spacing.lg,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      backgroundColor: colors.dangerSoft,
      borderRadius: radii.md,
    },
    errorText: { color: colors.danger, fontSize: 14, flex: 1 },
    resultCard: {
      marginTop: spacing.xl,
      padding: spacing.lg,
    },
    resultHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: spacing.md,
    },
    preview: {
      width: 72,
      height: 72,
      borderRadius: radii.md,
      backgroundColor: surface.thumbBg,
      ...shadow.card,
    },
    savedTag: {
      ...typography.micro,
      color: colors.accent,
      marginBottom: 4,
    },
    resultTitle: {
      ...typography.headline,
      color: colors.text,
    },
    resultSub: {
      fontSize: 14,
      color: colors.textSecondary,
      marginTop: 2,
    },
    tagRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    tag: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: radii.pill,
      backgroundColor: colors.accentSoft,
    },
    colorTag: {
      backgroundColor: surface.chipInactive,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.hairline,
    },
    tagText: {
      fontSize: 13,
      color: colors.text,
      fontWeight: '600',
    },
  });
}
