import React from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewProps,
  ViewStyle,
  StyleProp,
  PressableProps,
  TextStyle,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import { blur, radii, shadow, typography } from '../theme';

type GlassCardProps = ViewProps & {
  intensity?: number;
  radius?: number;
  tint?: 'light' | 'dark' | 'default';
  padded?: boolean;
  /** Readable panels over busy backgrounds / modals; uses a solid surface on dark mode (no glass blur). */
  variant?: 'glass' | 'solid';
};

export function GlassCard({
  children,
  style,
  intensity = blur.cardIntensity,
  radius = radii.lg,
  tint,
  padded = true,
  variant = 'glass',
  ...rest
}: GlassCardProps) {
  const { colors, surface, mode } = useTheme();
  const resolvedTint = tint ?? surface.blurTint;
  /* Light: blur clips show a gray rim; hairlines/shadows read as a dirty frame on white fills. */
  const lightSurface = mode === 'light';
  const solidCard = variant === 'solid';
  const skipCardBlur = lightSurface || solidCard;
  const cardShadow = lightSurface
    ? Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOpacity: 0,
          shadowRadius: 0,
          shadowOffset: { width: 0, height: 0 },
        },
        default: { elevation: 0 },
      })!
    : shadow.card;
  return (
    <View
      style={[
        sharedStyles.cardShell,
        Platform.OS === 'android' &&
          (lightSurface || solidCard
            ? { backgroundColor: colors.surfaceSolid }
            : { backgroundColor: surface.cardOverlay }),
        { borderRadius: radius },
        cardShadow,
        style,
      ]}
      {...rest}
    >
      {!skipCardBlur ? (
        <BlurView
          intensity={intensity}
          tint={resolvedTint}
          style={[StyleSheet.absoluteFill, { borderRadius: radius }]}
        />
      ) : null}
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius: radius,
            backgroundColor: lightSurface || solidCard
              ? colors.surfaceSolid
              : surface.cardOverlay,
            borderWidth: lightSurface || solidCard ? 0 : StyleSheet.hairlineWidth,
            borderColor: surface.cardBorder,
          },
        ]}
      />
      <View style={[padded && sharedStyles.cardPadding, { borderRadius: radius }]}>
        {children}
      </View>
    </View>
  );
}

type GlassButtonProps = Omit<PressableProps, 'style'> & {
  title: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  fullWidth?: boolean;
};

export function GlassButton({
  title,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  style,
  textStyle,
  fullWidth = true,
  ...rest
}: GlassButtonProps) {
  const { colors, surface, mode } = useTheme();
  const isPrimary = variant === 'primary';
  const isDanger = variant === 'danger';
  /* Light blur + light overlays reads as a solid white tile; Android blur is often opaque. */
  const skipButtonBlur = mode === 'light' || Platform.OS === 'android';

  /* Light: skip border on filled secondaries — hairline reads as a dirty gray frame on white fills. */
  const lightFlatSecondary = mode === 'light' && !isDanger;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        sharedStyles.button,
        fullWidth && { alignSelf: 'stretch' },
        isPrimary && shadow.button,
        { opacity: pressed || disabled ? 0.85 : 1 },
        style,
      ]}
      {...rest}
    >
      {isPrimary ? (
        <LinearGradient
          colors={colors.accentGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, { borderRadius: radii.md }]}
        />
      ) : (
        <>
          {!skipButtonBlur ? (
            <BlurView
              intensity={50}
              tint={surface.blurTint}
              style={[StyleSheet.absoluteFill, { borderRadius: radii.md }]}
            />
          ) : null}
          <View
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundColor:
                  variant === 'ghost'
                    ? surface.ghostOverlay
                    : isDanger
                      ? colors.dangerSoft
                      : surface.secondaryOverlay,
                borderWidth: lightFlatSecondary ? 0 : StyleSheet.hairlineWidth,
                borderColor: isDanger
                  ? 'rgba(255, 69, 58, 0.32)'
                  : surface.secondaryBorder,
                borderRadius: radii.md,
              },
            ]}
          />
        </>
      )}
      {loading ? (
        <ActivityIndicator color={isPrimary ? '#fff' : colors.accent} />
      ) : (
        <Text
          style={[
            sharedStyles.buttonText,
            {
              color: isPrimary
                ? '#fff'
                : isDanger
                  ? colors.danger
                  : colors.text,
            },
            textStyle,
          ]}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}

type GlassBackgroundProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function GlassBackground({ children, style }: GlassBackgroundProps) {
  const { colors } = useTheme();
  return (
    <View style={[{ flex: 1, backgroundColor: colors.bg }, style]}>
      <LinearGradient
        colors={colors.bgGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {children}
    </View>
  );
}

type Orb = {
  size: number;
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
  color: string;
};

type ScreenBackgroundProps = {
  orbs?: Orb[];
  children?: React.ReactNode;
};

export function ScreenBackground({
  orbs,
  children,
}: ScreenBackgroundProps) {
  const { colors, surface } = useTheme();
  const resolvedOrbs: Orb[] = orbs ?? [
    { size: 260, top: -65, right: -85, color: colors.orbPurple },
    { size: 220, top: 140, left: -95, color: colors.orbPink },
    { size: 280, bottom: -95, right: -75, color: colors.orbBlue },
  ];
  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg }]}
      collapsable={false}
    >
      <LinearGradient
        colors={colors.bgGradient}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {resolvedOrbs.map((o, i) => (
        <View
          key={i}
          style={[
            {
              position: 'absolute',
              width: o.size,
              height: o.size,
              borderRadius: o.size / 2,
              backgroundColor: o.color,
              opacity: 1,
            },
            o.top !== undefined && { top: o.top },
            o.bottom !== undefined && { bottom: o.bottom },
            o.left !== undefined && { left: o.left },
            o.right !== undefined && { right: o.right },
          ]}
        />
      ))}
      <BlurView
        intensity={Platform.OS === 'ios' ? 72 : 52}
        tint={surface.blurTint}
        style={StyleSheet.absoluteFill}
      />
      {children}
    </View>
  );
}

type GlassInputContainerProps = ViewProps;

export function GlassInputContainer({
  children,
  style,
  ...rest
}: GlassInputContainerProps) {
  const { colors, surface, mode } = useTheme();
  const lightSurface = mode === 'light';
  const skipInputBlur = lightSurface;
  return (
    <View
      style={[
        sharedStyles.inputShell,
        style,
      ]}
      {...rest}
    >
      {!skipInputBlur ? (
        <BlurView
          intensity={30}
          tint={surface.blurTint}
          style={[StyleSheet.absoluteFill, { borderRadius: radii.md }]}
        />
      ) : null}
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius: radii.md,
            backgroundColor: lightSurface
              ? colors.surfaceSolid
              : surface.inputOverlay,
            borderWidth: lightSurface ? 0 : StyleSheet.hairlineWidth,
            borderColor: surface.inputBorder,
          },
        ]}
      />
      {children}
    </View>
  );
}

const sharedStyles = StyleSheet.create({
  cardShell: {
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  cardPadding: {
    padding: 16,
  },
  button: {
    minHeight: 52,
    borderRadius: radii.md,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  buttonText: {
    ...typography.bodyMedium,
    fontSize: 16,
    fontWeight: '600',
  },
  inputShell: {
    minHeight: 52,
    borderRadius: radii.md,
    overflow: 'hidden',
    justifyContent: 'center',
  },
});
