import React, { useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import type { FitCheckPairing } from '../api/types';
import * as api from '../api/client';
import type { UploadPhoto } from '../api/client';
import { imagePickerAssetToUpload } from '../utils/imageUpload';
import { GlassButton, GlassCard, GlassInputContainer, ScreenBackground } from '../components/Glass';
import { CLOTHING_SUBCATEGORIES } from '../constants/classification';
import { API_ORIGIN } from '../config';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tabTopPadding } from '../utils/screenSpacing';
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

type BulkResultState = {
  itemId: number;
  name: string;
  quantity: number;
};

type AddMode = 'individual' | 'bulk';

const MAX_PHOTOS = 4;

export function UploadScreen() {
  const insets = useSafeAreaInsets();
  const headerPad = tabTopPadding(insets);
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [photos, setPhotos] = useState<UploadPhoto[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ResultState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fitBusy, setFitBusy] = useState(false);
  const [fitError, setFitError] = useState<string | null>(null);
  const [fitPreview, setFitPreview] = useState<{
    classification: Record<string, unknown>;
    pairings: FitCheckPairing[];
  } | null>(null);

  const [mode, setMode] = useState<AddMode>('individual');
  const [bulkName, setBulkName] = useState('');
  const [bulkQty, setBulkQty] = useState('6');
  const [bulkSubcategory, setBulkSubcategory] = useState<string>('Footwear');
  const [bulkResult, setBulkResult] = useState<BulkResultState | null>(null);
  const [bulkRefPhoto, setBulkRefPhoto] = useState<UploadPhoto | null>(null);

  function presetBulkSocks() {
    setMode('bulk');
    setBulkSubcategory('Footwear');
    setBulkName('Crew socks');
    setBulkQty('6');
  }

  function presetBulkUnderwear() {
    setMode('bulk');
    setBulkSubcategory('Other');
    setBulkName('Underwear');
    setBulkQty('5');
  }

  function reset() {
    setPhotos([]);
    setResult(null);
    setBulkResult(null);
    setError(null);
    setFitPreview(null);
    setFitError(null);
    setBulkRefPhoto(null);
  }

  async function previewPairings() {
    if (photos.length === 0) return;
    setFitBusy(true);
    setFitError(null);
    setFitPreview(null);
    try {
      const data = await api.postClosetFitCheck(photos[0]);
      setFitPreview(data);
    } catch (e) {
      setFitError(e instanceof Error ? e.message : 'Could not preview pairings');
    } finally {
      setFitBusy(false);
    }
  }

  async function pickBulkReferencePhoto() {
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
      setBulkRefPhoto(await imagePickerAssetToUpload(picked.assets[0], 'bulkref'));
      setError(null);
    } catch {
      setError('Could not prepare that photo. Try another image or take a new one.');
    }
  }

  async function submitBulk() {
    const q = parseInt(bulkQty, 10);
    if (!bulkName.trim()) {
      setError('Add a short name (e.g. white crew socks).');
      return;
    }
    if (!Number.isFinite(q) || q < 1 || q > 999) {
      setError('Quantity should be between 1 and 999.');
      return;
    }
    setBusy(true);
    setError(null);
    setFitPreview(null);
    setFitError(null);
    try {
      const payload = {
        name: bulkName.trim(),
        subcategory: bulkSubcategory,
        quantity: q,
      };
      const data = bulkRefPhoto
        ? await api.createBulkItemWithPhoto(payload, bulkRefPhoto)
        : await api.createBulkItem(payload);
      setBulkResult({
        itemId: data.item_id,
        name: bulkName.trim(),
        quantity: q,
      });
      setResult(null);
      setBulkName('');
      setBulkQty(String(q));
      setBulkRefPhoto(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save bulk item');
    } finally {
      setBusy(false);
    }
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
      preferredAssetRepresentationMode:
        ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      allowsMultipleSelection: true,
      selectionLimit: remaining,
    });
    if (picked.canceled || !picked.assets?.length) return;
    try {
      const normalized = await Promise.all(
        picked.assets.map((asset) => imagePickerAssetToUpload(asset, 'upload'))
      );
      setPhotos((prev) => [...prev, ...normalized].slice(0, MAX_PHOTOS));
    } catch {
      setError('Could not prepare one of those photos. Try a different image.');
    }
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
    try {
      const photo = await imagePickerAssetToUpload(picked.assets[0], 'upload');
      setPhotos((prev) => [...prev, photo].slice(0, MAX_PHOTOS));
    } catch {
      setError('Could not prepare that photo. Try another image or take a new one.');
    }
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
    setFitPreview(null);
    setFitError(null);
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
      setBulkResult(null);
      setPhotos([]);
      if (
        data.duplicate_hint &&
        data.duplicate_hint.existing_similar_count > 0
      ) {
        const h = data.duplicate_hint;
        Alert.alert(
          'Similar items',
          `You already have ${h.existing_similar_count} item(s) in category “${h.category}” with ${h.color}. This new one will be #${h.existing_similar_count + 1}.`
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Upload failed';
      setError(
        /network request failed/i.test(msg)
          ? 'Upload could not reach the API. Make sure your phone is still on the same Wi-Fi, then try a smaller/clearer photo.'
          : msg
      );
    } finally {
      setBusy(false);
    }
  }

  const canAdd = photos.length < MAX_PHOTOS;

  return (
    <View style={{ flex: 1 }}>
      <ScreenBackground />
      <ScrollView
        contentContainerStyle={[styles.container, { paddingTop: headerPad }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.heading}>Add an item</Text>

        <View style={styles.modeRow}>
          <Pressable
            onPress={() => {
              setMode('individual');
              setError(null);
            }}
            style={({ pressed }) => [
              styles.modeChip,
              mode === 'individual' && styles.modeChipOn,
              { opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Text
              style={[
                styles.modeChipText,
                mode === 'individual' && styles.modeChipTextOn,
              ]}
            >
              Individual
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setMode('bulk');
              setError(null);
            }}
            style={({ pressed }) => [
              styles.modeChip,
              mode === 'bulk' && styles.modeChipOn,
              { opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Text
              style={[
                styles.modeChipText,
                mode === 'bulk' && styles.modeChipTextOn,
              ]}
            >
              Bulk basics
            </Text>
          </Pressable>
        </View>

        <Text style={styles.blurb}>
          {mode === 'individual'
            ? "Snap a photo of the front, then add a back shot for items with prints, logos, or rear details. We'll classify the front and merge the colors."
            : 'Socks, underwear, and plain tees can live as one card with a total count and how many are clean. Add an optional reference photo for the grid and similarity search.'}
        </Text>

        {mode === 'individual' && photos.length > 0 ? (
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

        {mode === 'bulk' ? (
          <GlassCard padded style={styles.bulkCard}>
            <Text style={styles.bulkHint}>Quick presets</Text>
            <View style={styles.presetRow}>
              <Pressable
                onPress={presetBulkSocks}
                style={({ pressed }) => [styles.presetChip, pressed && { opacity: 0.8 }]}
              >
                <Text style={styles.presetChipText}>Socks → bulk</Text>
              </Pressable>
              <Pressable
                onPress={presetBulkUnderwear}
                style={({ pressed }) => [styles.presetChip, pressed && { opacity: 0.8 }]}
              >
                <Text style={styles.presetChipText}>Underwear → bulk</Text>
              </Pressable>
            </View>
            <Text style={styles.fieldLabel}>Name</Text>
            <GlassInputContainer>
              <TextInput
                value={bulkName}
                onChangeText={setBulkName}
                placeholder="e.g. white crew socks"
                placeholderTextColor={colors.textMuted}
                style={styles.textField}
              />
            </GlassInputContainer>
            <Text style={styles.fieldLabel}>How many?</Text>
            <GlassInputContainer>
              <TextInput
                value={bulkQty}
                onChangeText={setBulkQty}
                keyboardType="number-pad"
                placeholder="6"
                placeholderTextColor={colors.textMuted}
                style={styles.textField}
              />
            </GlassInputContainer>
            <Text style={styles.fieldLabel}>Group as (for outfits)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.subScroll}>
              {CLOTHING_SUBCATEGORIES.map((slot) => (
                <Pressable
                  key={slot}
                  onPress={() => setBulkSubcategory(slot)}
                  style={[
                    styles.subChip,
                    bulkSubcategory === slot && styles.subChipOn,
                  ]}
                >
                  <Text
                    style={[
                      styles.subChipText,
                      bulkSubcategory === slot && styles.subChipTextOn,
                    ]}
                  >
                    {slot}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <Text style={styles.fieldLabel}>Reference photo (optional)</Text>
            <View style={styles.refPhotoRow}>
              {bulkRefPhoto ? (
                <Image
                  source={{ uri: bulkRefPhoto.uri }}
                  style={styles.refPhotoThumb}
                />
              ) : (
                <View style={[styles.refPhotoThumb, styles.refPhotoPlaceholder]} />
              )}
              <View style={{ flex: 1, gap: spacing.sm }}>
                <GlassButton
                  title={bulkRefPhoto ? 'Replace photo' : 'Pick reference'}
                  onPress={pickBulkReferencePhoto}
                  variant="ghost"
                  disabled={busy}
                />
                {bulkRefPhoto ? (
                  <GlassButton
                    title="Remove photo"
                    onPress={() => setBulkRefPhoto(null)}
                    variant="ghost"
                    disabled={busy}
                  />
                ) : null}
              </View>
            </View>
            <GlassButton
              title="Save bulk item"
              onPress={submitBulk}
              loading={busy}
              style={{ marginTop: spacing.md }}
            />
          </GlassCard>
        ) : null}

        {mode === 'individual' ? (
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
                title="Preview pairings (first photo, not saved)"
                onPress={previewPairings}
                loading={fitBusy}
                variant="ghost"
                disabled={busy}
                style={styles.flexBtn}
              />
            </View>
          ) : null}
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
        ) : null}

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

        {fitError ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{fitError}</Text>
          </View>
        ) : null}

        {fitPreview ? (
          <GlassCard padded style={styles.resultCard}>
            <Text style={styles.resultTitle}>Closet pairings</Text>
            <Text style={styles.resultSub}>
              {(fitPreview.classification.category as string) ?? 'Item'} · uses
              front photo only. Nothing is saved until you tap Add to closet.
            </Text>
            {fitPreview.pairings.length === 0 ? (
              <Text style={styles.resultSub}>
                Add more clean pieces or try a clearer front shot.
              </Text>
            ) : (
              fitPreview.pairings.slice(0, 15).map((p) => (
                <Text key={p.item.id} style={styles.pairingLine}>
                  <Text style={styles.pairingScore}>{p.score}</Text> —{' '}
                  {p.item.subcategory} ({p.item.category}) ·{' '}
                  {p.hints.join(' · ')}
                </Text>
              ))
            )}
          </GlassCard>
        ) : null}

        {bulkResult ? (
          <GlassCard padded style={styles.resultCard}>
            <Text style={styles.savedTag}>Bulk saved · #{bulkResult.itemId}</Text>
            <Text style={styles.resultTitle}>{bulkResult.name}</Text>
            <Text style={styles.resultSub}>
              ×{bulkResult.quantity} total — all clean for now. Adjust counts anytime from item
              detail.
            </Text>
            <GlassButton title="Add another" onPress={() => setBulkResult(null)} variant="ghost" />
          </GlassCard>
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
    modeRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    modeChip: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: radii.md,
      alignItems: 'center',
      backgroundColor: surface.chipInactive,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: surface.chipInactiveBorder,
    },
    modeChipOn: {
      backgroundColor: colors.accentSoft,
      borderColor: colors.accent,
    },
    modeChipText: {
      ...typography.callout,
      color: colors.textSecondary,
      fontWeight: '600',
    },
    modeChipTextOn: {
      color: colors.accent,
    },
    bulkCard: {
      marginBottom: spacing.lg,
      gap: spacing.sm,
    },
    bulkHint: {
      ...typography.micro,
      color: colors.textMuted,
      marginBottom: spacing.xs,
    },
    presetRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginBottom: spacing.md,
      flexWrap: 'wrap',
    },
    presetChip: {
      paddingHorizontal: spacing.md,
      paddingVertical: 8,
      borderRadius: radii.pill,
      backgroundColor: surface.thumbBg,
    },
    presetChipText: {
      ...typography.callout,
      color: colors.text,
      fontWeight: '600',
    },
    fieldLabel: {
      ...typography.micro,
      color: colors.textMuted,
      marginBottom: 4,
      marginTop: spacing.xs,
    },
    textField: {
      ...typography.body,
      color: colors.text,
      paddingVertical: 10,
      paddingHorizontal: spacing.sm,
      minHeight: 44,
    },
    subScroll: {
      marginTop: spacing.xs,
      marginBottom: spacing.sm,
    },
    subChip: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: radii.pill,
      marginRight: spacing.sm,
      backgroundColor: surface.chipInactive,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: surface.chipInactiveBorder,
    },
    subChipOn: {
      borderColor: colors.accent,
      backgroundColor: colors.accentSoft,
    },
    subChipText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    subChipTextOn: {
      color: colors.accent,
    },
    refPhotoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      marginTop: spacing.xs,
      marginBottom: spacing.sm,
    },
    refPhotoThumb: {
      width: 72,
      height: 72,
      borderRadius: radii.md,
      backgroundColor: surface.thumbBg,
    },
    refPhotoPlaceholder: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: surface.chipInactiveBorder,
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
    pairingLine: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: spacing.sm,
      lineHeight: 18,
    },
    pairingScore: {
      fontWeight: '700',
      color: colors.accent,
    },
  });
}
