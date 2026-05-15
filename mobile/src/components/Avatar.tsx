import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { absoluteUrl } from '../config';
import { useTheme } from '../context/ThemeContext';
import { radii } from '../theme';

type AvatarProps = {
  url?: string | null;
  name?: string | null;
  username?: string | null;
  size?: number;
};

export function Avatar({ url, name, username, size = 44 }: AvatarProps) {
  const { colors } = useTheme();
  const initials = (name || username || '?')
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const uri = absoluteUrl(url);
  const fontSize = Math.max(11, Math.round(size * 0.38));
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{
          width: size,
          height: size,
          borderRadius: radii.pill,
          backgroundColor: colors.accentSoft,
        }}
      />
    );
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radii.pill,
        backgroundColor: colors.accentSoft,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          color: colors.accent,
          fontWeight: '700',
          fontSize,
          letterSpacing: 0.4,
        }}
      >
        {initials || '?'}
      </Text>
    </View>
  );
}

const _styles = StyleSheet.create({});
