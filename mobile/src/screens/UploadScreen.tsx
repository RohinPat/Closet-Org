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
import type { FitCheckPairing, WishlistIntent } from '../api/types';
import * as api from '../api/client';
import type { UploadPhoto } from '../api/client';
import { imagePickerAssetToUpload } from '../utils/imageUpload';
import { GlassButton, GlassCard, GlassInputContainer, ScreenBackground } from '../components/Glass';
import { CLOTHING_SUBCATEGORIES, CLOTHING_COLORS } from '../constants/classification';
import { API_ORIGIN } from '../config';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  tabScrollContentPaddingTop,
  TAB_SCREEN_SCROLL_BOTTOM,
} from '../utils/screenSpacing';
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
  color_hexes?: string[];
  pattern?: string;
};

type ResultState = {
  itemId: number;
  classification: Classification;
  previewUri: string;
  duplicateMessage?: string;
};

type BulkResultState = {
  itemId: number;
  name: string;
  quantity: number;
};

type ImportFlow = 'csv' | 'manual';

type AddMode = 'individual' | 'bulk' | 'import';

type BulkSuggestion = {
  name: string;
  subcategory: string;
  quantity: string;
  reason: string;
};

const MAX_PHOTOS = 4;
const WISHLIST_INTENTS: { value: WishlistIntent; label: string }[] = [
  { value: 'want', label: 'Want' },
  { value: 'saving', label: 'Saving' },
  { value: 'sale_watch', label: 'Sale watch' },
  { value: 'gift', label: 'Gift' },
];

function smartBulkSuggestion(classification: Classification): BulkSuggestion | null {
  const text = `${classification.category ?? ''} ${classification.subcategory ?? ''}`.toLowerCase();
  if (text.includes('sock')) {
    return { name: 'Crew socks', subcategory: 'Footwear', quantity: '6', reason: 'socks are easiest to track as a count' };
  }
  if (text.includes('underwear') || text.includes('boxer') || text.includes('brief')) {
    return { name: 'Underwear', subcategory: 'Other', quantity: '5', reason: 'underwear is usually interchangeable' };
  }
  if (text.includes('undershirt')) {
    return { name: 'Undershirts', subcategory: 'Top', quantity: '4', reason: 'undershirts are usually interchangeable' };
  }
  if (classification.category === 'T-Shirt' && classification.subcategory === 'Top') {
    return { name: 'Basic tees', subcategory: 'Top', quantity: '4', reason: 'plain tees often work better as bulk basics' };
  }
  return null;
}

export function UploadScreen() {
  const insets = useSafeAreaInsets();
  const scrollTop = tabScrollContentPaddingTop(insets);
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
  const [wishlistOpen, setWishlistOpen] = useState(false);
  const [wishlistName, setWishlistName] = useState('');
  const [wishlistIntent, setWishlistIntent] = useState<WishlistIntent>('want');
  const [wishlistPrice, setWishlistPrice] = useState('');
  const [wishlistUrl, setWishlistUrl] = useState('');
  const [wishlistNotes, setWishlistNotes] = useState('');
  const [csvText, setCsvText] = useState('');
  const [csvResult, setCsvResult] = useState<{ created: number; skipped: number } | null>(null);
  const [importFlow, setImportFlow] = useState<ImportFlow>('csv');
  const [manualTitle, setManualTitle] = useState('');
  const [manualSubcategory, setManualSubcategory] = useState<string>('Other');
  const [manualColorPicks, setManualColorPicks] = useState<string[]>([]);
  const [manualColorExtras, setManualColorExtras] = useState('');
  const [manualDescription, setManualDescription] = useState('');
  const [manualLabelsRaw, setManualLabelsRaw] = useState('');
  const [manualSaved, setManualSaved] = useState<{ title: string; itemId: number } | null>(null);
  const [bulkSuggestion, setBulkSuggestion] = useState<BulkSuggestion | null>(null);

  function presetBulkSocks() {
    setMode('bulk');
    setBulkSubcategory('Footwear');
    setBulkName('Crew socks');
    setBulkQty('6');
    setBulkSuggestion(null);
  }

  function presetBulkUnderwear() {
    setMode('bulk');
    setBulkSubcategory('Other');
    setBulkName('Underwear');
    setBulkQty('5');
    setBulkSuggestion(null);
  }

  function reset() {
    setPhotos([]);
    setResult(null);
    setBulkResult(null);
    setError(null);
    setFitPreview(null);
    setFitError(null);
    setBulkRefPhoto(null);
    setWishlistOpen(false);
    setCsvResult(null);
    setManualTitle('');
    setManualSubcategory('Other');
    setManualColorPicks([]);
    setManualColorExtras('');
    setManualDescription('');
    setManualLabelsRaw('');
    setManualSaved(null);
    setBulkSuggestion(null);
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
      const preview = await api.postClosetFitCheck(photos[0]);
      const suggestedBulk = smartBulkSuggestion(preview.classification as Classification);
      if (suggestedBulk) {
        setMode('bulk');
        setBulkName(suggestedBulk.name);
        setBulkSubcategory(suggestedBulk.subcategory);
        setBulkQty(suggestedBulk.quantity);
        setBulkRefPhoto(photos[0]);
        setBulkSuggestion(suggestedBulk);
        setPhotos([]);
        return;
      }
      const data = await api.uploadClothing(photos);
      const previewUri = data.thumbnail_url
        ? `${API_ORIGIN}${data.thumbnail_url}`
        : photos[0].uri;
      setResult({
        itemId: data.item_id,
        classification: data.classification as Classification,
        previewUri,
        duplicateMessage:
          data.duplicate_hint?.visual_candidates?.length
            ? `${data.duplicate_hint.visual_candidates.length} visual duplicate candidate(s) found.`
            : data.duplicate_hint?.existing_similar_count
              ? `${data.duplicate_hint.existing_similar_count} same-color category match(es) already exist.`
              : undefined,
      });
      setBulkResult(null);
      setPhotos([]);
      if (data.duplicate_hint?.visual_candidates?.length) {
        Alert.alert(
          'Possible duplicate',
          'This upload looks visually close to something already in your closet. Review the saved item before keeping both.'
        );
      } else if (
        data.duplicate_hint &&
        (data.duplicate_hint.existing_similar_count ?? 0) > 0
      ) {
        const h = data.duplicate_hint;
        Alert.alert(
          'Similar items',
          `You already have ${h.existing_similar_count} item(s) in category “${h.category}” with ${h.color}. This new one will be #${(h.existing_similar_count ?? 0) + 1}.`
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

  async function savePhotosToWishlist() {
    if (photos.length === 0) return;
    const trimmed = wishlistName.trim();
    if (!trimmed) {
      setError('Add a wishlist name first.');
      return;
    }
    let priceNum: number | null = null;
    if (wishlistPrice.trim()) {
      const n = parseFloat(wishlistPrice.trim());
      if (Number.isNaN(n)) {
        setError('Wishlist price should be a number, e.g. 49.99.');
        return;
      }
      priceNum = n;
    }
    setBusy(true);
    setError(null);
    try {
      await api.uploadWishlistPhotos(photos, {
        name: trimmed,
        intent: wishlistIntent,
        price: priceNum,
        url: wishlistUrl.trim() || null,
        notes: wishlistNotes.trim() || null,
      });
      setPhotos([]);
      setFitPreview(null);
      setWishlistOpen(false);
      setWishlistName('');
      setWishlistPrice('');
      setWishlistUrl('');
      setWishlistNotes('');
      setResult(null);
      setBulkResult(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save wishlist item');
    } finally {
      setBusy(false);
    }
  }

  async function importCsv() {
    if (!csvText.trim()) {
      setError('Paste a CSV with a header row first.');
      return;
    }
    setBusy(true);
    setError(null);
    setCsvResult(null);
    setManualSaved(null);
    try {
      const imported = await api.importClosetCsv(csvText);
      setCsvResult({
        created: imported.created,
        skipped: imported.skipped?.length ?? 0,
      });
      setCsvText('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not import CSV');
    } finally {
      setBusy(false);
    }
  }

  function toggleManualColor(name: string) {
    setManualColorPicks((prev) =>
      prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name]
    );
  }

  function mergeManualColors(chips: string[], extrasRaw: string): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    const add = (s: string) => {
      const t = s.trim();
      if (!t) return;
      const k = t.toLowerCase();
      if (seen.has(k)) return;
      seen.add(k);
      out.push(t);
    };
    for (const c of chips) add(c);
    for (const part of extrasRaw.split(/[,;/\n]/)) add(part);
    return out.slice(0, 24);
  }

  function parseManualTags(raw: string): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const part of raw.split(/[,;/\n]/)) {
      const t = part.trim();
      if (!t) continue;
      const k = t.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(t);
      if (out.length >= 48) break;
    }
    return out;
  }

  async function submitManualImport() {
    const title = manualTitle.trim();
    if (!title) {
      setError('Add a title — it is what shows on your closet card.');
      return;
    }
    setBusy(true);
    setError(null);
    setCsvResult(null);
    setManualSaved(null);
    try {
      const colors = mergeManualColors(manualColorPicks, manualColorExtras);
      const tags = parseManualTags(manualLabelsRaw);
      const res = await api.importClosetManual({
        title,
        subcategory: manualSubcategory,
        colors: colors.length > 0 ? colors : undefined,
        description: manualDescription.trim() || null,
        tags: tags.length > 0 ? tags : undefined,
      });
      setManualSaved({ title, itemId: res.item_id });
      setManualTitle('');
      setManualColorPicks([]);
      setManualColorExtras('');
      setManualDescription('');
      setManualLabelsRaw('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add item');
    } finally {
      setBusy(false);
    }
  }

  const canAdd = photos.length < MAX_PHOTOS;

  return (
    <View style={{ flex: 1 }}>
      <ScreenBackground />
      <ScrollView
        contentContainerStyle={[styles.container, { paddingTop: scrollTop }]}
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
          <Pressable
            onPress={() => {
              setMode('import');
              setError(null);
              setCsvResult(null);
              setManualSaved(null);
            }}
            style={({ pressed }) => [
              styles.modeChip,
              mode === 'import' && styles.modeChipOn,
              { opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Text
              style={[
                styles.modeChipText,
                mode === 'import' && styles.modeChipTextOn,
              ]}
            >
              Import
            </Text>
          </Pressable>
        </View>

        <Text style={styles.blurb}>
          {mode === 'individual'
            ? "Snap a photo of the front, then add a back shot for items with prints, logos, or rear details. We'll classify the front and merge the colors."
            : mode === 'bulk'
              ? 'Socks, underwear, and plain tees can live as one card with a total count and how many are clean. Add an optional reference photo for the grid and similarity search.'
              : importFlow === 'csv'
                ? 'Paste rows from a spreadsheet (CSV). Keep the first row as headers — name, category, colors, tags, notes, price, care, and more.'
                : 'Skip the camera: give the piece a title, tap colors or type extra ones, and add notes and labels — saved like a spreadsheet row without a photo.'}
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
            {bulkSuggestion ? (
              <View style={styles.suggestionBox}>
                <Ionicons name="sparkles-outline" size={18} color={colors.accent} />
                <Text style={styles.suggestionText}>
                  Classified as a basic: {bulkSuggestion.reason}. Review the count,
                  then save as bulk.
                </Text>
              </View>
            ) : null}
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

        {mode === 'import' ? (
          <GlassCard padded style={styles.bulkCard}>
            <View style={styles.importModeRow}>
              <Pressable
                onPress={() => {
                  setImportFlow('csv');
                  setError(null);
                }}
                style={({ pressed }) => [
                  styles.modeChip,
                  importFlow === 'csv' && styles.modeChipOn,
                  { opacity: pressed ? 0.85 : 1, flex: 1 },
                ]}
              >
                <Text
                  style={[
                    styles.modeChipText,
                    importFlow === 'csv' && styles.modeChipTextOn,
                  ]}
                >
                  Paste CSV
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setImportFlow('manual');
                  setError(null);
                }}
                style={({ pressed }) => [
                  styles.modeChip,
                  importFlow === 'manual' && styles.modeChipOn,
                  { opacity: pressed ? 0.85 : 1, flex: 1 },
                ]}
              >
                <Text
                  style={[
                    styles.modeChipText,
                    importFlow === 'manual' && styles.modeChipTextOn,
                  ]}
                >
                  Manual
                </Text>
              </Pressable>
            </View>

            {importFlow === 'csv' ? (
              <>
                <Text style={styles.bulkHint}>Spreadsheet rows</Text>
                <Text style={styles.resultSub}>
                  Copy from Sheets or Excel. The first line must be column headers.
                </Text>
                <GlassInputContainer>
                  <TextInput
                    value={csvText}
                    onChangeText={setCsvText}
                    multiline
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder={
                      'name,category,subcategory,colors,brand,size\nWhite tee,T-Shirt,Top,White,Hanes,M'
                    }
                    placeholderTextColor={colors.textMuted}
                    style={[styles.textField, styles.csvField]}
                  />
                </GlassInputContainer>
                <GlassButton
                  title="Import rows"
                  onPress={importCsv}
                  loading={busy}
                  style={{ marginTop: spacing.md }}
                />
                {csvResult ? (
                  <Text style={styles.resultSub}>
                    Imported {csvResult.created} item{csvResult.created === 1 ? '' : 's'}
                    {csvResult.skipped ? ` · ${csvResult.skipped} skipped` : ''}.
                  </Text>
                ) : null}
              </>
            ) : (
              <>
                <Text style={styles.bulkHint}>One item, no photo</Text>
                <Text style={styles.fieldLabel}>Title</Text>
                <GlassInputContainer>
                  <TextInput
                    value={manualTitle}
                    onChangeText={setManualTitle}
                    placeholder="e.g. black wool peacoat"
                    placeholderTextColor={colors.textMuted}
                    style={styles.textField}
                  />
                </GlassInputContainer>
                <Text style={styles.fieldLabel}>Outfit slot</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.subScroll}
                >
                  {CLOTHING_SUBCATEGORIES.map((slot) => (
                    <Pressable
                      key={slot}
                      onPress={() => setManualSubcategory(slot)}
                      style={[
                        styles.subChip,
                        manualSubcategory === slot && styles.subChipOn,
                      ]}
                    >
                      <Text
                        style={[
                          styles.subChipText,
                          manualSubcategory === slot && styles.subChipTextOn,
                        ]}
                      >
                        {slot}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
                <Text style={styles.fieldLabel}>Colors</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.subScroll}
                >
                  {CLOTHING_COLORS.map((c) => {
                    const on = manualColorPicks.includes(c);
                    return (
                      <Pressable
                        key={c}
                        onPress={() => toggleManualColor(c)}
                        style={[styles.subChip, on && styles.subChipOn]}
                      >
                        <Text
                          style={[
                            styles.subChipText,
                            on && styles.subChipTextOn,
                          ]}
                        >
                          {c}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
                <GlassInputContainer>
                  <TextInput
                    value={manualColorExtras}
                    onChangeText={setManualColorExtras}
                    placeholder="Or type extra colors: burgundy, cream"
                    placeholderTextColor={colors.textMuted}
                    style={styles.textField}
                  />
                </GlassInputContainer>
                <Text style={styles.fieldLabel}>Description</Text>
                <GlassInputContainer>
                  <TextInput
                    value={manualDescription}
                    onChangeText={setManualDescription}
                    multiline
                    placeholder="Fit, fabric, where you got it…"
                    placeholderTextColor={colors.textMuted}
                    style={[styles.textField, styles.notesField]}
                  />
                </GlassInputContainer>
                <Text style={styles.fieldLabel}>Labels (comma-separated)</Text>
                <GlassInputContainer>
                  <TextInput
                    value={manualLabelsRaw}
                    onChangeText={setManualLabelsRaw}
                    placeholder="work, winter, sustainable"
                    placeholderTextColor={colors.textMuted}
                    style={styles.textField}
                  />
                </GlassInputContainer>
                <GlassButton
                  title="Add to closet"
                  onPress={submitManualImport}
                  loading={busy}
                  style={{ marginTop: spacing.md }}
                />
                {manualSaved ? (
                  <Text style={styles.resultSub}>
                    {`Saved "${manualSaved.title}" · item #${manualSaved.itemId}`}
                  </Text>
                ) : null}
              </>
            )}
          </GlassCard>
        ) : null}

        {mode === 'individual' ? (
        <GlassCard padded={false} style={styles.actionCard}>
          <View style={styles.actionStack}>
            <GlassButton
              title={canAdd ? 'Pick from library' : 'Limit reached'}
              onPress={pickFromLibrary}
              disabled={!canAdd || busy}
              style={styles.flexBtn}
            />
            <GlassButton
              title="Take photo"
              onPress={takePhoto}
              variant="ghost"
              disabled={!canAdd || busy}
              style={styles.flexBtn}
            />
            {photos.length > 0 ? (
              <GlassButton
                title="Preview pairings (first photo, not saved)"
                onPress={previewPairings}
                loading={fitBusy}
                variant="ghost"
                disabled={busy}
                style={styles.flexBtn}
              />
            ) : null}
            {photos.length > 0 ? (
              <GlassButton
                title="Save photos to wishlist"
                onPress={() => {
                  const fallback =
                    (fitPreview?.classification.category as string | undefined) ||
                    'Wishlist item';
                  setWishlistName((prev) => prev || fallback);
                  setWishlistOpen((prev) => !prev);
                }}
                variant="ghost"
                disabled={busy}
                style={styles.flexBtn}
              />
            ) : null}
            {photos.length > 0 ? (
              <GlassButton
                title={`Add ${photos.length} photo${photos.length === 1 ? '' : 's'} to closet`}
                onPress={upload}
                loading={busy}
                style={styles.flexBtn}
              />
            ) : null}
          </View>
        </GlassCard>
        ) : null}

        {mode === 'individual' && wishlistOpen && photos.length > 0 ? (
          <GlassCard padded style={styles.wishlistCard}>
            <Text style={styles.resultTitle}>Wishlist target</Text>
            <Text style={styles.resultSub}>
              Save this photo as shopping research. It stays out of closet stats
              and outfits until you promote it.
            </Text>
            <Text style={styles.fieldLabel}>Name</Text>
            <GlassInputContainer>
              <TextInput
                value={wishlistName}
                onChangeText={setWishlistName}
                placeholder="e.g. neutral chore jacket"
                placeholderTextColor={colors.textMuted}
                style={styles.textField}
              />
            </GlassInputContainer>
            <Text style={styles.fieldLabel}>Buying intent</Text>
            <View style={styles.presetRow}>
              {WISHLIST_INTENTS.map((opt) => {
                const active = wishlistIntent === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => setWishlistIntent(opt.value)}
                    style={[
                      styles.presetChip,
                      active && styles.intentChipOn,
                    ]}
                  >
                    <Text
                      style={[
                        styles.presetChipText,
                        active && styles.intentChipTextOn,
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.fieldLabel}>Price and link (optional)</Text>
            <View style={styles.inlineFields}>
              <GlassInputContainer style={{ flex: 1 }}>
                <TextInput
                  value={wishlistPrice}
                  onChangeText={setWishlistPrice}
                  keyboardType="decimal-pad"
                  placeholder="49.99"
                  placeholderTextColor={colors.textMuted}
                  style={styles.textField}
                />
              </GlassInputContainer>
              <GlassInputContainer style={{ flex: 1 }}>
                <TextInput
                  value={wishlistUrl}
                  onChangeText={setWishlistUrl}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  placeholder="Store URL"
                  placeholderTextColor={colors.textMuted}
                  style={styles.textField}
                />
              </GlassInputContainer>
            </View>
            <Text style={styles.fieldLabel}>What would this unlock?</Text>
            <GlassInputContainer>
              <TextInput
                value={wishlistNotes}
                onChangeText={setWishlistNotes}
                multiline
                placeholder="e.g. fills outerwear gap; works with black jeans"
                placeholderTextColor={colors.textMuted}
                style={[styles.textField, styles.notesField]}
              />
            </GlassInputContainer>
            <GlassButton
              title="Save to wishlist"
              onPress={savePhotosToWishlist}
              loading={busy}
              style={{ marginTop: spacing.md }}
            />
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
            <Text style={styles.resultTitle}>What this would unlock</Text>
            <Text style={styles.resultSub}>
              {(fitPreview.classification.category as string) ?? 'Item'} · uses
              front photo only. Nothing is saved until you tap Add to closet.
            </Text>
            {fitPreview.pairings.length > 0 ? (
              <View style={styles.unlockBox}>
                <Text style={styles.unlockTitle}>
                  Works with {fitPreview.pairings.length} clean closet pieces
                </Text>
                <Text style={styles.unlockCopy}>
                  Best early matches: {fitPreview.pairings
                    .slice(0, 3)
                    .map((p) => p.item.subcategory)
                    .join(', ')}
                  .
                </Text>
              </View>
            ) : (
              <View style={styles.unlockBox}>
                <Text style={styles.unlockTitle}>Potential gap item</Text>
                <Text style={styles.unlockCopy}>
                  No strong pairings yet. Save it to your wishlist if this is a
                  buying target, or add complementary basics first.
                </Text>
              </View>
            )}
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
              {(result.classification.color_hexes ?? []).map((hex) => (
                <View key={hex} style={[styles.hexDot, { backgroundColor: hex }]} />
              ))}
              {result.classification.pattern ? (
                <View style={styles.tag}>
                  <Text style={styles.tagText}>{result.classification.pattern}</Text>
                </View>
              ) : null}
            </View>
            {result.duplicateMessage ? (
              <View style={styles.warningBox}>
                <Ionicons name="copy-outline" size={16} color={colors.warning} />
                <Text style={styles.warningText}>{result.duplicateMessage}</Text>
              </View>
            ) : null}

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
      paddingBottom: TAB_SCREEN_SCROLL_BOTTOM,
    },
    heading: {
      ...typography.title,
      color: colors.text,
      marginBottom: spacing.md,
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
      marginBottom: spacing.lg,
    },
    importModeRow: {
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
    wishlistCard: {
      marginTop: spacing.lg,
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
    intentChipOn: {
      backgroundColor: colors.accentSoft,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.accent,
    },
    intentChipTextOn: {
      color: colors.accent,
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
    notesField: {
      minHeight: 84,
      textAlignVertical: 'top',
    },
    csvField: {
      minHeight: 160,
      textAlignVertical: 'top',
    },
    suggestionBox: {
      flexDirection: 'row',
      gap: spacing.sm,
      alignItems: 'flex-start',
      borderRadius: radii.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.accent,
      backgroundColor: colors.accentSoft,
      padding: spacing.md,
      marginBottom: spacing.md,
    },
    suggestionText: {
      ...typography.callout,
      color: colors.text,
      flex: 1,
      lineHeight: 20,
    },
    inlineFields: {
      flexDirection: 'row',
      gap: spacing.sm,
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
      padding: spacing.lg,
    },
    actionStack: {
      gap: spacing.sm,
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
    unlockBox: {
      padding: spacing.md,
      borderRadius: radii.md,
      backgroundColor: colors.accentSoft,
      marginTop: spacing.md,
      marginBottom: spacing.sm,
    },
    unlockTitle: {
      ...typography.bodyMedium,
      color: colors.text,
      marginBottom: 4,
    },
    unlockCopy: {
      fontSize: 13,
      color: colors.textSecondary,
      lineHeight: 18,
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
    hexDot: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.hairline,
    },
    warningBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: spacing.md,
      padding: spacing.md,
      borderRadius: radii.md,
      backgroundColor: colors.accentSoft,
    },
    warningText: {
      flex: 1,
      color: colors.text,
      fontSize: 13,
      lineHeight: 18,
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
