import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  FlatList,
  type ListRenderItemInfo,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
  Linking,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { privacyPolicyUrl, termsOfServiceUrl } from '../legal';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import {
  useTheme,
  useThemedStyles,
  type ThemeContextValue,
} from '../context/ThemeContext';
import { GlassButton, GlassCard, ScreenBackground } from '../components/Glass';
import { setOnboardingCarouselStatus } from '../preferences';
import { radii, shadow, spacing, typography } from '../theme';
import type { ThemeColors, ThemeSurface } from '../theme';

type Slide = {
  key: string;
  title: string;
  lead: string;
  bullets: string[];
  icon: keyof typeof Ionicons.glyphMap;
  visual: 'closer_grid' | 'add_flow' | 'care_trust' | 'privacy';
};

const SLIDES: Slide[] = [
  {
    key: 'belief',
    title: 'Your closet,\non your phone',
    lead: 'A garment-first grid that feels like opening your wardrobe — not filing a spreadsheet.',
    bullets: [
      'Browse pieces in a calm photo grid with density you control',
      'Filter by clean / wash, favorites, color, and location',
      'Wishlist and lends stay separate so planning stays honest',
    ],
    icon: 'shirt-outline',
    visual: 'closer_grid',
  },
  {
    key: 'loop',
    title: 'From photo\nto outfit',
    lead: 'Add from camera or library, then plan fits and share when you want — all from one closet.',
    bullets: [
      'Uploads run through smart tagging you can fix anytime',
      'Outfit suggestions respect vibes, season, and what you have',
      'Fit posts and trips: pack mode, logs, and planning ahead',
    ],
    icon: 'images-outline',
    visual: 'add_flow',
  },
  {
    key: 'trust',
    title: 'Care & wear\nyou can read',
    lead: 'Status never relies on color alone — icons, labels, and counts stay legible in light and dark.',
    bullets: [
      'Wash, worn, packed, and lend states across the closet',
      'Notes, care hints, and cost-per-wear on item detail',
      'Insights surface gaps and pieces worth another look',
    ],
    icon: 'heart-outline',
    visual: 'care_trust',
  },
  {
    key: 'privacy',
    title: 'Yours first',
    lead: 'Your photos and metadata stay tied to your account. We build for real closets, not ad profiles.',
    bullets: [
      'Sign-in keeps your wardrobe private to this app',
      'You control what you post socially — closet-only mode exists',
      'Privacy policy link appears here when you ship to stores',
    ],
    icon: 'shield-checkmark-outline',
    visual: 'privacy',
  },
];

function orbsForSlide(
  index: number,
  c: ThemeColors
): {
  size: number;
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
  color: string;
}[] {
  const sets: {
    size: number;
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
    color: string;
  }[][] = [
    [
      { size: 340, top: -90, right: -100, color: c.orbPurple },
      { size: 260, top: 100, left: -110, color: c.orbPink },
      { size: 280, bottom: -100, left: 40, color: c.orbBlue },
    ],
    [
      { size: 320, top: -70, left: -80, color: c.orbBlue },
      { size: 240, top: 90, right: -100, color: c.orbPurple },
      { size: 300, bottom: -80, right: -50, color: c.orbPink },
    ],
    [
      { size: 330, top: -60, right: -70, color: c.orbPink },
      { size: 250, bottom: 30, left: -90, color: c.orbBlue },
      { size: 270, top: 150, right: 4, color: c.orbPurple },
    ],
    [
      { size: 300, top: -50, left: -60, color: c.orbPurple },
      { size: 280, bottom: -100, right: -80, color: c.orbBlue },
      { size: 220, top: 130, right: -20, color: c.orbPink },
    ],
  ];
  return sets[index % sets.length];
}

function useSlideEntrance(isActive: boolean, reduceMotion: boolean) {
  const opacity = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!isActive) return;
    if (reduceMotion) {
      opacity.setValue(1);
      translateY.setValue(0);
      return;
    }
    opacity.setValue(0);
    translateY.setValue(22);
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        friction: 9,
        tension: 68,
        useNativeDriver: true,
      }),
    ]).start();
  }, [isActive, reduceMotion, opacity, translateY]);

  return {
    opacity,
    transform: [{ translateY }],
  };
}

/** Editor-style closet hero: stacked frames, not a fake mini-grid */
function ClosetHeroMock({
  colors,
  surface,
}: {
  colors: ThemeColors;
  surface: ThemeSurface;
}) {
  return (
    <View style={stylesMock.heroStack} accessibilityLabel="Illustration: wardrobe photos as cards">
      <View
        style={[
          stylesMock.heroCardBack,
          {
            backgroundColor: surface.secondaryOverlay,
            borderColor: surface.secondaryBorder,
          },
        ]}
      />
      <LinearGradient
        colors={[colors.surfaceSolid, surface.cardOverlay]}
        start={{ x: 0.45, y: 0 }}
        end={{ x: 0.55, y: 1 }}
        style={[
          stylesMock.heroCardFront,
          {
            borderColor: surface.cardBorder,
          },
        ]}
      >
        <Ionicons
          name="shirt-outline"
          size={48}
          color={colors.accent}
          style={stylesMock.heroFrontIcon}
        />
        <Text style={[stylesMock.heroTagline, { color: colors.textSecondary }]}>
          Garment photos, calm grid
        </Text>
      </LinearGradient>
    </View>
  );
}

function AddFlowMock({
  colors,
  surface,
}: {
  colors: ThemeColors;
  surface: ThemeSurface;
}) {
  const chips: { icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
    { icon: 'camera-outline', label: 'Add' },
    { icon: 'sparkles-outline', label: 'Outfits' },
    { icon: 'stats-chart-outline', label: 'Stats' },
    { icon: 'calendar-outline', label: 'Plan' },
  ];
  return (
    <View style={stylesMock.flowRow}>
      {chips.map((c) => (
        <View
          key={c.label}
          style={[
            stylesMock.flowChip,
            {
              backgroundColor: surface.secondaryOverlay,
              borderColor: surface.secondaryBorder,
            },
          ]}
        >
          <LinearGradient
            colors={colors.accentGradient}
            style={stylesMock.flowIconBg}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Ionicons name={c.icon} size={20} color="#FFF" />
          </LinearGradient>
          <Text style={[stylesMock.flowChipLabel, { color: colors.text }]}>
            {c.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

function CareTrustMock({ colors, surface }: { colors: ThemeColors; surface: ThemeSurface }) {
  const tags = ['Clean', 'Wash', 'Packed', 'Lent'];
  return (
    <View style={stylesMock.careWrap}>
      <View style={stylesMock.careChips}>
        {tags.map((t) => (
          <View
            key={t}
            style={[
              stylesMock.careChip,
              {
                backgroundColor: surface.secondaryOverlay,
                borderColor: colors.accentSoft,
              },
            ]}
          >
            <Ionicons name="pricetag-outline" size={14} color={colors.accent} />
            <Text style={[stylesMock.careChipText, { color: colors.text }]}>
              {t}
            </Text>
          </View>
        ))}
      </View>
      <View style={stylesMock.careFoot}>
        <Ionicons name="information-circle-outline" size={18} color={colors.textMuted} />
        <Text style={[stylesMock.careFootText, { color: colors.textMuted }]}>
          Labels + icons everywhere — not color alone
        </Text>
      </View>
    </View>
  );
}

function PrivacyMock({ colors }: { colors: ThemeColors }) {
  return (
    <View style={stylesMock.privacyVisual}>
      <LinearGradient
        colors={colors.accentGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={stylesMock.privacyOrb}
      >
        <Ionicons name="lock-closed" size={40} color="#FFFFFF" />
      </LinearGradient>
    </View>
  );
}

function FeatureVisual({
  visual,
  colors,
  surface,
}: {
  visual: Slide['visual'];
  colors: ThemeColors;
  surface: ThemeSurface;
}) {
  switch (visual) {
    case 'closer_grid':
      return <ClosetHeroMock colors={colors} surface={surface} />;
    case 'add_flow':
      return <AddFlowMock colors={colors} surface={surface} />;
    case 'care_trust':
      return <CareTrustMock colors={colors} surface={surface} />;
    case 'privacy':
      return <PrivacyMock colors={colors} />;
    default:
      return null;
  }
}

const stylesMock = StyleSheet.create({
  heroStack: {
    width: '100%',
    minHeight: 196,
    maxHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  heroCardBack: {
    position: 'absolute',
    width: '74%',
    height: 132,
    borderRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth,
    top: 28,
    transform: [{ rotate: '-5deg' }],
    opacity: 0.92,
  },
  heroCardFront: {
    width: '84%',
    maxWidth: 320,
    height: 168,
    borderRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    ...shadow.card,
  },
  heroFrontIcon: {
    opacity: 0.85,
    marginBottom: spacing.sm,
  },
  heroTagline: {
    ...typography.caption,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  flowRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
    width: '100%',
  },
  flowChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  flowIconBg: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flowChipLabel: {
    ...typography.bodyMedium,
    fontSize: 15,
  },
  careWrap: { width: '100%', gap: 12 },
  careChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  careChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  careChipText: {
    ...typography.caption,
    fontSize: 13,
    fontWeight: '600',
  },
  careFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  careFootText: {
    ...typography.caption,
    flex: 1,
    lineHeight: 18,
  },
  privacyVisual: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
  },
  privacyOrb: {
    width: 96,
    height: 96,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.button,
  },
});

type SlidePageProps = {
  item: Slide;
  pageIndex: number;
  activeIndex: number;
  reduceMotion: boolean;
  width: number;
  listPadBottom: number;
  heroMinH: number;
  colors: ThemeColors;
  surface: ThemeSurface;
  privacyUrl: string | null;
  termsUrl: string | null;
  scrollTo: (next: number, animated: boolean) => void;
  finish: (status: 'completed' | 'skipped') => Promise<void>;
};

function OnboardingSlidePage({
  item,
  pageIndex,
  activeIndex,
  reduceMotion,
  width,
  listPadBottom,
  heroMinH,
  colors,
  surface,
  privacyUrl,
  termsUrl,
  scrollTo,
  finish,
}: SlidePageProps) {
  const styles = useThemedStyles(makeStyles);
  const isActive = pageIndex === activeIndex;
  const enter = useSlideEntrance(isActive, reduceMotion);
  const isPrivacy = item.key === 'privacy';

  return (
    <View style={[styles.slide, { width }]}>
      <Animated.View style={[styles.slideInner, enter]}>
        <ScrollView
          style={styles.slideScroll}
          contentContainerStyle={styles.slideScrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          bounces
        >
          <View style={[styles.heroVisual, { minHeight: heroMinH }]}>
            <FeatureVisual visual={item.visual} colors={colors} surface={surface} />
          </View>

          <GlassCard style={[styles.slideCard, shadow.card]} padded>
            <Text style={styles.eyebrow}>
              Tour · {pageIndex + 1} / {SLIDES.length}
            </Text>
            <View style={styles.medallionWrap}>
              <LinearGradient
                colors={colors.accentGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.medallion}
              >
                <Ionicons name={item.icon} size={34} color="#FFFFFF" />
              </LinearGradient>
            </View>
            <Text style={styles.slideTitle}>{item.title}</Text>
            <Text style={styles.lead}>{item.lead}</Text>

            <View style={styles.bullets}>
              {item.bullets.map((line, bi) => (
                <View key={bi} style={styles.bulletRow}>
                  <Ionicons
                    name="checkmark-circle"
                    size={20}
                    color={colors.accent}
                    style={styles.bulletIcon}
                  />
                  <Text style={styles.bulletText}>{line}</Text>
                </View>
              ))}
            </View>

            {isPrivacy ? (
              <View style={styles.privacyBlock}>
                {privacyUrl || termsUrl ? (
                  <View style={styles.policyRow}>
                    {privacyUrl ? (
                      <Pressable
                        onPress={() => void Linking.openURL(privacyUrl)}
                        style={({ pressed }) => [
                          styles.policyPill,
                          { opacity: pressed ? 0.82 : 1 },
                        ]}
                        accessibilityRole="link"
                        accessibilityLabel="Open privacy policy"
                      >
                        <Ionicons
                          name="open-outline"
                          size={18}
                          color={colors.accent}
                        />
                        <Text style={styles.policyPillText}>Privacy</Text>
                      </Pressable>
                    ) : null}
                    {termsUrl ? (
                      <Pressable
                        onPress={() => void Linking.openURL(termsUrl)}
                        style={({ pressed }) => [
                          styles.policyPill,
                          { opacity: pressed ? 0.82 : 1 },
                        ]}
                        accessibilityRole="link"
                        accessibilityLabel="Open terms of service"
                      >
                        <Ionicons
                          name="open-outline"
                          size={18}
                          color={colors.accent}
                        />
                        <Text style={styles.policyPillText}>Terms</Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : (
                  <Text style={styles.mutedNote}>
                    Legal documents will be linked here for store release.
                  </Text>
                )}
              </View>
            ) : null}
          </GlassCard>
        </ScrollView>
      </Animated.View>

      <View style={[styles.ctaRow, { paddingBottom: listPadBottom }]}>
        <GlassButton
          title={pageIndex < SLIDES.length - 1 ? 'Continue' : 'Get started'}
          onPress={() =>
            pageIndex < SLIDES.length - 1
              ? scrollTo(pageIndex + 1, true)
              : void finish('completed')
          }
          style={styles.ctaPrimary}
        />
      </View>
    </View>
  );
}

type Props = {
  onFinished: () => void;
};

export function OnboardingCarouselScreen({ onFinished }: Props) {
  const { colors, surface } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const width = winW;
  const listRef = useRef<FlatList<Slide>>(null);
  const [index, setIndex] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);

  const backOpacity = useRef(new Animated.Value(0)).current;

  const orbs = useMemo(() => orbsForSlide(index, colors), [index, colors]);

  const privacyUrl = privacyPolicyUrl();
  const termsUrl = termsOfServiceUrl();

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (!cancelled) setReduceMotion(v);
    });
    const sub = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion
    );
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  useEffect(() => {
    const show = index > 0;
    if (reduceMotion) {
      backOpacity.setValue(show ? 1 : 0);
      return;
    }
    Animated.timing(backOpacity, {
      toValue: show ? 1 : 0,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [index, reduceMotion, backOpacity]);

  const finish = useCallback(
    async (status: 'completed' | 'skipped') => {
      await setOnboardingCarouselStatus(status);
      onFinished();
    },
    [onFinished]
  );

  const scrollTo = useCallback(
    (next: number, animated: boolean) => {
      const clamped = Math.min(Math.max(next, 0), SLIDES.length - 1);
      listRef.current?.scrollToOffset({
        offset: clamped * width,
        animated: animated && !reduceMotion,
      });
      setIndex(clamped);
    },
    [width, reduceMotion]
  );

  const onScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x;
      const next = Math.round(x / Math.max(width, 1));
      setIndex(Math.min(Math.max(next, 0), SLIDES.length - 1));
    },
    [width]
  );

  const listPadBottom = Math.max(insets.bottom, spacing.md);
  const heroMinH = Math.min(Math.max(winH * 0.18, 120), 200);

  const renderItem = useCallback(
    ({ item, index: i }: ListRenderItemInfo<Slide>) => (
      <OnboardingSlidePage
        item={item}
        pageIndex={i}
        activeIndex={index}
        reduceMotion={reduceMotion}
        width={width}
        listPadBottom={listPadBottom}
        heroMinH={heroMinH}
        colors={colors}
        surface={surface}
        privacyUrl={privacyUrl}
        termsUrl={termsUrl}
        scrollTo={scrollTo}
        finish={finish}
      />
    ),
    [
      finish,
      privacyUrl,
      termsUrl,
      scrollTo,
      colors,
      surface,
      width,
      index,
      reduceMotion,
      listPadBottom,
      heroMinH,
    ]
  );

  return (
    <View style={styles.root}>
      <ScreenBackground orbs={orbs} />
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={[styles.topChrome, { paddingTop: insets.top + spacing.sm }]}>
          <Animated.View
            style={[styles.backWrap, { opacity: backOpacity }]}
            pointerEvents={index > 0 ? 'auto' : 'none'}
          >
            <Pressable
              onPress={() => scrollTo(index - 1, true)}
              style={({ pressed }) => [
                styles.backPill,
                {
                  backgroundColor: surface.cardOverlay,
                  borderColor: surface.cardBorder,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Previous slide"
            >
              <Ionicons name="chevron-back" size={26} color={colors.text} />
            </Pressable>
          </Animated.View>

          <View style={styles.topCenter}>
            <Text style={styles.stepPillText}>
              {index + 1} / {SLIDES.length}
            </Text>
          </View>

          <Pressable
            onPress={() => void finish('skipped')}
            style={({ pressed }) => [
              styles.skipPill,
              {
                backgroundColor: surface.cardOverlay,
                borderColor: surface.cardBorder,
                opacity: pressed ? 0.88 : 1,
              },
            ]}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Skip introduction"
          >
            <Text style={styles.skipText}>Skip</Text>
          </Pressable>
        </View>

        <FlatList
          ref={listRef}
          style={styles.list}
          data={SLIDES}
          keyExtractor={(s) => s.key}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          renderItem={renderItem}
          onMomentumScrollEnd={onScrollEnd}
          onScrollEndDrag={onScrollEnd}
          extraData={index}
          getItemLayout={(_, i) => ({
            length: width,
            offset: width * i,
            index: i,
          })}
          keyboardShouldPersistTaps="handled"
          accessibilityRole="none"
        />

        <View style={[styles.dots, { paddingBottom: Math.max(insets.bottom, 8) }]}>
          {SLIDES.map((s, i) => (
            <View
              key={s.key}
              style={[
                i === index ? styles.dotActive : styles.dotIdle,
                {
                  backgroundColor:
                    i === index ? colors.accent : colors.hairline,
                  opacity: i === index ? 1 : 0.45,
                },
              ]}
              accessibilityLabel={`Slide ${i + 1} of ${SLIDES.length}`}
            />
          ))}
        </View>
      </SafeAreaView>
    </View>
  );
}

function makeStyles(t: ThemeContextValue) {
  const { colors, surface } = t;
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    safe: { flex: 1 },
    list: { flex: 1 },
    topChrome: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.sm,
      minHeight: 52,
    },
    backWrap: {
      width: 48,
      height: 48,
      alignItems: 'flex-start',
      justifyContent: 'center',
    },
    backPill: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: StyleSheet.hairlineWidth,
    },
    topCenter: {
      position: 'absolute',
      left: 0,
      right: 0,
      alignItems: 'center',
      pointerEvents: 'none',
    },
    stepPillText: {
      ...typography.micro,
      color: colors.textMuted,
      letterSpacing: 1.2,
    },
    skipPill: {
      paddingHorizontal: spacing.md,
      paddingVertical: 10,
      borderRadius: radii.lg,
      borderWidth: StyleSheet.hairlineWidth,
      minWidth: 72,
      alignItems: 'center',
    },
    skipText: {
      ...typography.bodyMedium,
      fontSize: 15,
      color: colors.accent,
    },
    slide: {
      flex: 1,
      paddingHorizontal: spacing.md,
    },
    slideInner: {
      flex: 1,
      minHeight: 0,
    },
    slideScroll: {
      flex: 1,
    },
    slideScrollContent: {
      flexGrow: 1,
      paddingBottom: spacing.sm,
    },
    heroVisual: {
      marginBottom: spacing.md,
      justifyContent: 'center',
    },
    slideCard: {
      borderRadius: radii.xl,
    },
    eyebrow: {
      ...typography.micro,
      color: colors.textMuted,
      marginBottom: spacing.md,
      letterSpacing: 1,
    },
    medallionWrap: {
      alignItems: 'flex-start',
      marginBottom: spacing.md,
    },
    medallion: {
      width: 72,
      height: 72,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
      ...shadow.button,
    },
    slideTitle: {
      ...typography.largeTitle,
      fontSize: 28,
      lineHeight: 34,
      color: colors.text,
      marginBottom: spacing.sm,
    },
    lead: {
      ...typography.callout,
      fontSize: 16,
      lineHeight: 24,
      color: colors.textSecondary,
      marginBottom: spacing.lg,
    },
    bullets: { gap: spacing.md },
    bulletRow: { flexDirection: 'row', alignItems: 'flex-start' },
    bulletIcon: { marginRight: 10, marginTop: 2 },
    bulletText: {
      ...typography.body,
      fontSize: 15,
      lineHeight: 22,
      color: colors.text,
      flex: 1,
    },
    privacyBlock: {
      marginTop: spacing.lg,
    },
    policyRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    policyPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      alignSelf: 'flex-start',
      paddingVertical: 12,
      paddingHorizontal: spacing.md,
      borderRadius: radii.lg,
      backgroundColor: surface.secondaryOverlay,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: surface.secondaryBorder,
    },
    policyPillText: {
      ...typography.bodyMedium,
      color: colors.accent,
    },
    mutedNote: {
      ...typography.caption,
      color: colors.textMuted,
      lineHeight: 20,
    },
    ctaRow: {
      marginTop: spacing.sm,
      paddingTop: spacing.sm,
    },
    ctaPrimary: {
      minHeight: 54,
    },
    dots: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 8,
      paddingTop: spacing.xs,
    },
    dotActive: {
      width: 28,
      height: 8,
      borderRadius: 4,
    },
    dotIdle: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
  });
}
