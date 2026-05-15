import React from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { absoluteUrl, itemImageUrl } from '../config';
import { useTheme } from '../context/ThemeContext';
import { radii, shadow, spacing, typography } from '../theme';
import { GlassCard } from './Glass';
import { Avatar } from './Avatar';
import type { FitPost } from '../api/types';

export const REACTION_OPTIONS = ['🔥', '❤️', '👏', '🧊', '✨', '👀'];

function relativeTime(iso: string | undefined | null): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (isNaN(t)) return '';
  const seconds = Math.max(0, (Date.now() - t) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 86400 * 7) return `${Math.floor(seconds / 86400)}d`;
  if (seconds < 86400 * 30) return `${Math.floor(seconds / (86400 * 7))}w`;
  return new Date(t).toLocaleDateString();
}

type PostCardProps = {
  post: FitPost;
  onPress?: () => void;
  onPressAuthor?: () => void;
  onReact?: (emoji: string) => void;
  onComment?: () => void;
  compact?: boolean;
};

export function PostCard({
  post,
  onPress,
  onPressAuthor,
  onReact,
  onComment,
  compact,
}: PostCardProps) {
  const { colors, surface } = useTheme();
  const styles = makeStyles({ colors, surface });
  const imageUri = absoluteUrl(post.image_path);
  const mineReactions = new Set(
    post.reactions.filter((r) => r.mine).map((r) => r.emoji)
  );

  return (
    <GlassCard padded={false} style={styles.card}>
      <Pressable
        onPress={onPressAuthor}
        style={styles.header}
        hitSlop={6}
      >
        <Avatar
          url={post.author?.avatar_url}
          name={post.author?.full_name}
          username={post.author?.username}
          size={38}
        />
        <View style={styles.headerText}>
          <Text style={styles.authorName} numberOfLines={1}>
            {post.author?.full_name || post.author?.username || 'Someone'}
          </Text>
          <Text style={styles.metaLine} numberOfLines={1}>
            @{post.author?.username || '—'} · {relativeTime(post.created_at)}
          </Text>
        </View>
      </Pressable>

      <Pressable onPress={onPress}>
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.image} resizeMode="cover" />
        ) : (
          <View style={[styles.image, styles.placeholder]} />
        )}
      </Pressable>

      {post.caption ? (
        <Text style={styles.caption} numberOfLines={compact ? 2 : undefined}>
          {post.caption}
        </Text>
      ) : null}

      {post.items.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.itemRow}
        >
          {post.items.map((it) => {
            const uri = itemImageUrl(it.thumbnail_path || it.image_path);
            return (
              <View key={it.id} style={styles.itemChip}>
                {uri ? (
                  <Image source={{ uri }} style={styles.itemThumb} />
                ) : (
                  <View style={[styles.itemThumb, styles.placeholder]} />
                )}
                <Text style={styles.itemChipLabel} numberOfLines={1}>
                  {it.subcategory || it.category}
                </Text>
              </View>
            );
          })}
        </ScrollView>
      ) : null}

      <View style={styles.actionsRow}>
        <View style={styles.reactionsRow}>
          {REACTION_OPTIONS.map((emoji) => {
            const summary = post.reactions.find((r) => r.emoji === emoji);
            const mine = mineReactions.has(emoji);
            const count = summary?.count ?? 0;
            return (
              <Pressable
                key={emoji}
                onPress={() => onReact?.(emoji)}
                style={({ pressed }) => [
                  styles.reactBtn,
                  mine && styles.reactBtnActive,
                  { transform: [{ scale: pressed ? 0.92 : 1 }] },
                ]}
              >
                <Text style={styles.reactEmoji}>{emoji}</Text>
                {count > 0 ? (
                  <Text
                    style={[styles.reactCount, mine && styles.reactCountActive]}
                  >
                    {count}
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>

        <Pressable onPress={onComment} style={styles.commentBtn} hitSlop={6}>
          <Ionicons
            name="chatbubble-outline"
            size={18}
            color={colors.textSecondary}
          />
          <Text style={styles.commentCount}>{post.comment_count}</Text>
        </Pressable>
      </View>
    </GlassCard>
  );
}

function makeStyles({
  colors,
  surface,
}: {
  colors: ReturnType<typeof useTheme>['colors'];
  surface: ReturnType<typeof useTheme>['surface'];
}) {
  return StyleSheet.create({
    card: {
      marginBottom: spacing.lg,
      overflow: 'hidden',
      ...shadow.card,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
      paddingBottom: spacing.sm,
    },
    headerText: {
      flex: 1,
      marginLeft: spacing.md,
    },
    authorName: {
      ...typography.bodyMedium,
      color: colors.text,
    },
    metaLine: {
      fontSize: 12,
      color: colors.textMuted,
      marginTop: 1,
    },
    image: {
      width: '100%',
      aspectRatio: 4 / 5,
      backgroundColor: surface.thumbBg,
    },
    placeholder: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    caption: {
      ...typography.callout,
      color: colors.text,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      lineHeight: 20,
    },
    itemRow: {
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      gap: 8,
    },
    itemChip: {
      width: 64,
      alignItems: 'center',
    },
    itemThumb: {
      width: 56,
      height: 56,
      borderRadius: radii.sm,
      backgroundColor: surface.thumbBg,
    },
    itemChipLabel: {
      fontSize: 10,
      color: colors.textMuted,
      marginTop: 3,
      textAlign: 'center',
    },
    actionsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      paddingBottom: spacing.md,
    },
    reactionsRow: {
      flexDirection: 'row',
      gap: 6,
      flexWrap: 'wrap',
      flex: 1,
    },
    reactBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 5,
      borderRadius: radii.pill,
      backgroundColor: surface.chipInactive,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: surface.chipInactiveBorder,
    },
    reactBtnActive: {
      backgroundColor: colors.accentSoft,
      borderColor: colors.accent,
    },
    reactEmoji: {
      fontSize: 14,
    },
    reactCount: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    reactCountActive: {
      color: colors.accent,
    },
    commentBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    commentCount: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textSecondary,
    },
  });
}

export { relativeTime };
