import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as api from '../api/client';
import type {
  ClothingItem,
  WishlistCreate,
  WishlistIntent,
} from '../api/types';
import {
  GlassButton,
  GlassCard,
  GlassInputContainer,
  ScreenBackground,
} from '../components/Glass';
import type { AppStackParamList } from '../navigation/RootNavigator';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { stackTopPadding } from '../utils/screenSpacing';
import {
  radii,
  spacing,
  typography,
  type ThemeColors,
  type ThemeSurface,
} from '../theme';

type Props = NativeStackScreenProps<AppStackParamList, 'Wishlist'>;

type IntentOption = {
  value: WishlistIntent;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
};

const INTENT_OPTIONS: IntentOption[] = [
  { value: 'want', label: 'Want', icon: 'sparkles-outline' },
  { value: 'gift', label: 'As gift', icon: 'gift-outline' },
  { value: 'saving', label: 'Saving up', icon: 'wallet-outline' },
  { value: 'sale_watch', label: 'Watch sale', icon: 'pricetag-outline' },
];

function intentLabel(intent: WishlistIntent | null | undefined): string | null {
  return INTENT_OPTIONS.find((o) => o.value === intent)?.label ?? null;
}

function confirmRemove(message: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(
      typeof window !== 'undefined' ? window.confirm(message) : false
    );
  }
  return new Promise((resolve) => {
    Alert.alert('Remove from wishlist', message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Remove', style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

export function WishlistScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const headerPad = stackTopPadding(insets);
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const [items, setItems] = useState<ClothingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.fetchWishlist();
      setItems(res.items);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load wishlist');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
  }

  async function onPromote(item: ClothingItem) {
    setBusyId(item.id);
    try {
      await api.promoteWishlistItem(item.id);
      await load();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusyId(null);
    }
  }

  async function onDelete(item: ClothingItem) {
    const ok = await confirmRemove(
      `Remove "${item.wishlist_name || 'item'}" from your wishlist?`
    );
    if (!ok) return;
    setBusyId(item.id);
    try {
      await api.deleteItem(item.id);
      await load();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusyId(null);
    }
  }

  async function onCreate(body: WishlistCreate) {
    try {
      await api.createWishlistItem(body);
      setAddOpen(false);
      await load();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed');
    }
  }

  function openUrl(url: string | null | undefined) {
    if (!url) return;
    const cleaned = url.match(/^https?:\/\//) ? url : `https://${url}`;
    Linking.openURL(cleaned).catch(() => {
      Alert.alert('Cannot open link');
    });
  }

  return (
    <View style={{ flex: 1 }}>
      <ScreenBackground />
      <ScrollView
        contentContainerStyle={[styles.container, { paddingTop: headerPad }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
          />
        }
      >
        <Text style={styles.heading}>Wishlist</Text>
        <Text style={styles.blurb}>
          Things you want. Promote one to your closet when it arrives.
        </Text>

        <GlassButton
          title="Add to wishlist"
          onPress={() => setAddOpen(true)}
          style={styles.addBtn}
        />

        {loading ? (
          <ActivityIndicator
            style={{ marginTop: spacing.xl }}
            color={colors.accent}
          />
        ) : error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : items.length === 0 ? (
          <GlassCard padded style={styles.emptyCard}>
            <Ionicons
              name="bookmark-outline"
              size={28}
              color={colors.textMuted}
            />
            <Text style={styles.emptyTitle}>Your wishlist is empty</Text>
            <Text style={styles.emptyBlurb}>
              Tap “Add to wishlist” to save something you’re eyeing. It won’t
              show up in your closet, recommender, or stats until you promote
              it.
            </Text>
          </GlassCard>
        ) : (
          items.map((it) => {
            const label = intentLabel(it.wishlist_intent);
            const price =
              typeof it.purchase_price === 'number'
                ? `$${it.purchase_price.toFixed(2)}`
                : null;
            const isBusy = busyId === it.id;
            return (
              <GlassCard key={it.id} padded style={styles.itemCard}>
                <Text style={styles.itemTitle}>
                  {it.wishlist_name || 'Untitled'}
                </Text>
                <View style={styles.itemTagRow}>
                  {label ? (
                    <View style={styles.intentTag}>
                      <Text style={styles.intentTagText}>{label}</Text>
                    </View>
                  ) : null}
                  {price ? (
                    <View style={styles.priceTag}>
                      <Text style={styles.priceTagText}>{price}</Text>
                    </View>
                  ) : null}
                  {it.brand ? (
                    <View style={styles.brandTag}>
                      <Text style={styles.brandTagText}>{it.brand}</Text>
                    </View>
                  ) : null}
                </View>
                {it.wishlist_url ? (
                  <Pressable
                    onPress={() => openUrl(it.wishlist_url)}
                    style={styles.urlRow}
                  >
                    <Ionicons
                      name="link-outline"
                      size={14}
                      color={colors.accent}
                      style={{ marginRight: 4 }}
                    />
                    <Text style={styles.urlText} numberOfLines={1}>
                      {it.wishlist_url}
                    </Text>
                  </Pressable>
                ) : null}
                {it.notes ? (
                  <Text style={styles.notesText}>{it.notes}</Text>
                ) : null}
                <View style={styles.itemActions}>
                  <GlassButton
                    title="Got it — promote"
                    onPress={() => onPromote(it)}
                    loading={isBusy}
                    style={{ flex: 1 }}
                  />
                  <GlassButton
                    title="Remove"
                    onPress={() => onDelete(it)}
                    variant="ghost"
                    disabled={isBusy}
                    style={{ flex: 1 }}
                  />
                </View>
              </GlassCard>
            );
          })
        )}
      </ScrollView>

      <AddWishlistModal
        visible={addOpen}
        onCancel={() => setAddOpen(false)}
        onSave={onCreate}
      />
    </View>
  );
}

type AddProps = {
  visible: boolean;
  onCancel: () => void;
  onSave: (body: WishlistCreate) => void | Promise<void>;
};

function AddWishlistModal({ visible, onCancel, onSave }: AddProps) {
  const { colors, surface } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [name, setName] = useState('');
  const [intent, setIntent] = useState<WishlistIntent | null>(null);
  const [price, setPrice] = useState('');
  const [url, setUrl] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) {
      setName('');
      setIntent(null);
      setPrice('');
      setUrl('');
      setSaving(false);
    }
  }, [visible]);

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert('Name required', 'What is this item called?');
      return;
    }
    let priceNum: number | null = null;
    if (price.trim()) {
      const n = parseFloat(price.trim());
      if (Number.isNaN(n)) {
        Alert.alert('Invalid price', 'Enter a number, e.g. 49.99');
        return;
      }
      priceNum = n;
    }
    setSaving(true);
    try {
      await onSave({
        name: trimmed,
        intent,
        price: priceNum,
        url: url.trim() || null,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.modalBackdrop}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel}>
          <BlurView
            intensity={30}
            tint={surface.blurTint}
            style={StyleSheet.absoluteFill}
          />
          <View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: 'rgba(0,0,0,0.35)' },
            ]}
          />
        </Pressable>
        <GlassCard padded style={styles.modalCard}>
          <Text style={styles.modalTitle}>Add to wishlist</Text>
          <GlassInputContainer style={styles.modalInputShell}>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Name (e.g. Carhartt Detroit jacket)"
              placeholderTextColor={colors.placeholder}
              autoFocus
              style={styles.modalInput}
            />
          </GlassInputContainer>
          <View style={styles.intentRow}>
            {INTENT_OPTIONS.map((opt) => {
              const active = intent === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => setIntent(active ? null : opt.value)}
                  style={({ pressed }) => [
                    styles.intentChip,
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
                    size={14}
                    color={active ? '#fff' : colors.text}
                    style={{ marginRight: 4 }}
                  />
                  <Text
                    style={[
                      styles.intentChipText,
                      { color: active ? '#fff' : colors.text },
                    ]}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <GlassInputContainer style={styles.modalInputShell}>
            <TextInput
              value={price}
              onChangeText={setPrice}
              placeholder="Price (optional)"
              placeholderTextColor={colors.placeholder}
              keyboardType="decimal-pad"
              style={styles.modalInput}
            />
          </GlassInputContainer>
          <GlassInputContainer style={styles.modalInputShell}>
            <TextInput
              value={url}
              onChangeText={setUrl}
              placeholder="Link (optional)"
              placeholderTextColor={colors.placeholder}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              style={styles.modalInput}
            />
          </GlassInputContainer>
          <View style={styles.modalActions}>
            <GlassButton
              title="Cancel"
              variant="ghost"
              onPress={onCancel}
              style={{ flex: 1 }}
            />
            <GlassButton
              title="Add"
              onPress={handleSave}
              loading={saving}
              style={{ flex: 1 }}
            />
          </View>
        </GlassCard>
      </KeyboardAvoidingView>
    </Modal>
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
      marginBottom: 4,
    },
    blurb: {
      ...typography.callout,
      color: colors.textSecondary,
      marginBottom: spacing.lg,
      lineHeight: 22,
    },
    addBtn: {
      marginBottom: spacing.lg,
    },
    emptyCard: {
      alignItems: 'center',
      padding: spacing.xl,
      marginTop: spacing.md,
      gap: spacing.sm,
    },
    emptyTitle: {
      ...typography.headline,
      color: colors.text,
      marginTop: spacing.sm,
    },
    emptyBlurb: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 20,
    },
    errorText: {
      color: colors.danger,
      fontSize: 14,
      marginTop: spacing.lg,
    },
    itemCard: {
      padding: spacing.lg,
      marginBottom: spacing.md,
    },
    itemTitle: {
      ...typography.headline,
      color: colors.text,
      marginBottom: spacing.sm,
    },
    itemTagRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: spacing.sm,
    },
    intentTag: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: radii.pill,
      backgroundColor: colors.accentSoft,
    },
    intentTagText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.accent,
    },
    priceTag: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: radii.pill,
      backgroundColor: surface.chipInactive,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.hairline,
    },
    priceTagText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.text,
    },
    brandTag: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: radii.pill,
      backgroundColor: surface.chipInactive,
    },
    brandTagText: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    urlRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: spacing.sm,
    },
    urlText: {
      flex: 1,
      fontSize: 13,
      color: colors.accent,
    },
    notesText: {
      fontSize: 13,
      color: colors.textSecondary,
      lineHeight: 18,
      marginBottom: spacing.sm,
    },
    itemActions: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginTop: spacing.sm,
    },
    modalBackdrop: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: spacing.xl,
    },
    modalCard: {
      width: '100%',
      maxWidth: 460,
      padding: spacing.lg,
    },
    modalTitle: {
      ...typography.headline,
      color: colors.text,
      marginBottom: spacing.md,
    },
    modalInputShell: {
      minHeight: 52,
      marginBottom: spacing.md,
    },
    modalInput: {
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
      color: colors.text,
    },
    intentRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    intentChip: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: radii.pill,
      borderWidth: StyleSheet.hairlineWidth,
    },
    intentChipText: {
      fontSize: 13,
      fontWeight: '600',
    },
    modalActions: {
      flexDirection: 'row',
      gap: spacing.md,
    },
  });
}
