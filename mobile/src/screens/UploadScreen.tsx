import React, { useState } from 'react';
import {
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as api from '../api/client';
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

export function UploadScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ResultState | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pickAndUpload(useCamera: boolean) {
    setError(null);
    setResult(null);

    if (useCamera) {
      const cam = await ImagePicker.requestCameraPermissionsAsync();
      if (!cam.granted) {
        setError('Camera permission is required.');
        return;
      }
    } else {
      const lib = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!lib.granted) {
        setError('Photo library permission is required.');
        return;
      }
    }

    const picked = useCamera
      ? await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          quality: 0.85,
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 0.85,
        });

    if (picked.canceled || !picked.assets?.[0]) return;

    const asset = picked.assets[0];
    const uri = asset.uri;
    const mime = asset.mimeType || inferMime(uri);
    const filename = inferFilename(uri, mime);

    setBusy(true);
    try {
      const data = await api.uploadClothing(uri, filename, mime);
      // Prefer the server's background-removed thumbnail so the preview
      // matches what the closet grid will show; fall back to the local pick.
      const previewUri = data.thumbnail_url
        ? `${API_ORIGIN}${data.thumbnail_url}`
        : uri;
      setResult({
        itemId: data.item_id,
        classification: data.classification as Classification,
        previewUri,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

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
          Snap or pick a photo of a clothing item. We'll classify it and add it
          to your closet.
        </Text>

        <GlassCard padded={false} style={styles.actionCard}>
          <View style={styles.actionRow}>
            <GlassButton
              title="Pick from library"
              onPress={() => pickAndUpload(false)}
              loading={busy}
              style={styles.flexBtn}
            />
          </View>
          <View style={[styles.actionRow, { paddingTop: 0 }]}>
            <GlassButton
              title="Take photo"
              onPress={() => pickAndUpload(true)}
              variant="ghost"
              disabled={busy}
              style={styles.flexBtn}
            />
          </View>
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
