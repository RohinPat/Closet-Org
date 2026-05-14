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
};

export function GlassCard({
  children,
  style,
  intensity = blur.cardIntensity,
  radius = radii.lg,
  tint,
  padded = true,
  ...rest
}: GlassCardProps) {
  const { surface } = useTheme();
  const resolvedTint = tint ?? surface.blurTint;
  return (
    <View
      style={[
        sharedStyles.cardShell,
        Platform.OS === 'android' && { backgroundColor: surface.cardOverlay },
        { borderRadius: radius },
        shadow.card,
        style,
      ]}
      {...rest}
    >
      <BlurView
        intensity={intensity}
        tint={resolvedTint}
        style={[StyleSheet.absoluteFill, { borderRadius: radius }]}
      />
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius: radius,
            backgroundColor: surface.cardOverlay,
            borderWidth: StyleSheet.hairlineWidth,
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
  const { colors, surface } = useTheme();
  const isPrimary = variant === 'primary';
  const isDanger = variant === 'danger';

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
          style={StyleSheet.absoluteFill}
        />
      ) : (
        <>
          <BlurView
            intensity={50}
            tint={surface.blurTint}
            style={StyleSheet.absoluteFill}
          />
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
                borderWidth: StyleSheet.hairlineWidth,
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
    { size: 320, top: -80, right: -100, color: colors.orbPink },
    { size: 280, top: 180, left: -120, color: colors.orbPurple },
    { size: 360, bottom: -120, right: -90, color: colors.orbBlue },
    { size: 220, bottom: 220, left: -60, color: colors.orbPeach },
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
        intensity={Platform.OS === 'ios' ? 60 : 40}
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
  const { surface } = useTheme();
  return (
    <View
      style={[
        sharedStyles.inputShell,
        style,
      ]}
      {...rest}
    >
      <BlurView
        intensity={30}
        tint={surface.blurTint}
        style={[StyleSheet.absoluteFill, { borderRadius: radii.md }]}
      />
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius: radii.md,
            backgroundColor: surface.inputOverlay,
            borderWidth: StyleSheet.hairlineWidth,
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
