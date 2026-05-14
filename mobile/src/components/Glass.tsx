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
import { colors, radii, shadow, blur, typography } from '../theme';

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
  tint = blur.tint,
  padded = true,
  ...rest
}: GlassCardProps) {
  return (
    <View
      style={[
        styles.cardShell,
        { borderRadius: radius },
        shadow.card,
        style,
      ]}
      {...rest}
    >
      <BlurView
        intensity={intensity}
        tint={tint}
        style={[StyleSheet.absoluteFill, { borderRadius: radius }]}
      />
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius: radius,
            backgroundColor: 'rgba(255, 255, 255, 0.42)',
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: 'rgba(255, 255, 255, 0.6)',
          },
        ]}
      />
      <View style={[padded && styles.cardPadding, { borderRadius: radius }]}>
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
  const isPrimary = variant === 'primary';
  const isDanger = variant === 'danger';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
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
            tint="light"
            style={StyleSheet.absoluteFill}
          />
          <View
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundColor:
                  variant === 'ghost'
                    ? 'rgba(255, 255, 255, 0.4)'
                    : isDanger
                      ? colors.dangerSoft
                      : 'rgba(255, 255, 255, 0.55)',
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: isDanger
                  ? 'rgba(255, 69, 58, 0.32)'
                  : 'rgba(255, 255, 255, 0.7)',
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
            styles.buttonText,
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
  return (
    <View style={[styles.bg, style]}>
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

type GlassInputContainerProps = ViewProps;

export function GlassInputContainer({
  children,
  style,
  ...rest
}: GlassInputContainerProps) {
  return (
    <View
      style={[
        styles.inputShell,
        style,
      ]}
      {...rest}
    >
      <BlurView
        intensity={30}
        tint="light"
        style={[StyleSheet.absoluteFill, { borderRadius: radii.md }]}
      />
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius: radii.md,
            backgroundColor: 'rgba(255, 255, 255, 0.55)',
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: 'rgba(255, 255, 255, 0.65)',
          },
        ]}
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  cardShell: {
    overflow: 'hidden',
    backgroundColor: Platform.OS === 'android' ? colors.surface : 'transparent',
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
  bg: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  inputShell: {
    minHeight: 52,
    borderRadius: radii.md,
    overflow: 'hidden',
    justifyContent: 'center',
  },
});
