import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AppStackParamList } from '../navigation/RootNavigator';
import * as api from '../api/client';
import type { FitComment, FitPost } from '../api/types';
import { absoluteUrl, itemImageUrl } from '../config';
import {
  GlassButton,
  GlassCard,
  GlassInputContainer,
  ScreenBackground,
} from '../components/Glass';
import { Avatar } from '../components/Avatar';
import { REACTION_OPTIONS, relativeTime } from '../components/PostCard';
import { useAuth } from '../context/AuthContext';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import {
  radii,
  shadow,
  spacing,
  typography,
  type ThemeColors,
  type ThemeSurface,
} from '../theme';

type Props = NativeStackScreenProps<AppStackParamList, 'FitDetail'>;

export function FitDetailScreen({ route, navigation }: Props) {
  const { postId } = route.params;
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { user } = useAuth();

  const [post, setPost] = useState<FitPost | null>(null);
  const [comments, setComments] = useState<FitComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const listRef = useRef<FlatList<FitComment>>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [p, c] = await Promise.all([
        api.fetchFitPost(postId),
        api.fetchComments(postId),
      ]);
      setPost(p);
      setComments(c.comments);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load post');
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleReact(emoji: string) {
    if (!post) return;
    setPost((prev) => {
      if (!prev) return prev;
      const existing = prev.reactions.find((r) => r.emoji === emoji);
      let next = prev.reactions;
      if (existing) {
        const newCount = existing.count + (existing.mine ? -1 : 1);
        const mineNext = !existing.mine;
        if (newCount <= 0 && !mineNext) {
          next = prev.reactions.filter((r) => r.emoji !== emoji);
        } else {
          next = prev.reactions.map((r) =>
            r.emoji === emoji ? { ...r, count: newCount, mine: mineNext } : r
          );
        }
      } else {
        next = [...prev.reactions, { emoji, count: 1, mine: true }];
      }
      return { ...prev, reactions: next };
    });
    try {
      await api.toggleReaction(postId, emoji);
    } catch {
      // On error, refetch the post to get true state.
      try {
        const fresh = await api.fetchFitPost(postId);
        setPost(fresh);
      } catch {}
    }
  }

  async function submitComment() {
    const body = draft.trim();
    if (!body || posting) return;
    setPosting(true);
    try {
      const res = await api.postComment(postId, body);
      const newComment: FitComment = {
        id: res.comment_id,
        body,
        created_at: new Date().toISOString(),
        author: {
          id: user!.id,
          username: user!.username,
          full_name: user?.full_name ?? null,
          avatar_url: user?.avatar_url ?? null,
        },
      };
      setComments((prev) => [...prev, newComment]);
      setDraft('');
      setPost((prev) =>
        prev ? { ...prev, comment_count: prev.comment_count + 1 } : prev
      );
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    } catch (e) {
      Alert.alert('Could not post', e instanceof Error ? e.message : 'Error');
    } finally {
      setPosting(false);
    }
  }

  async function handleDeleteComment(commentId: number) {
    Alert.alert('Delete comment?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteComment(commentId);
            setComments((prev) => prev.filter((c) => c.id !== commentId));
            setPost((prev) =>
              prev
                ? { ...prev, comment_count: Math.max(0, prev.comment_count - 1) }
                : prev
            );
          } catch (e) {
            Alert.alert('Could not delete', e instanceof Error ? e.message : 'Error');
          }
        },
      },
    ]);
  }

  async function handleDeletePost() {
    if (!post) return;
    Alert.alert('Delete this post?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteFitPost(post.id);
            navigation.goBack();
          } catch (e) {
            Alert.alert('Could not delete', e instanceof Error ? e.message : 'Error');
          }
        },
      },
    ]);
  }

  if (loading) {
    return (
      <View style={{ flex: 1 }}>
        <ScreenBackground />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      </View>
    );
  }

  if (error || !post) {
    return (
      <View style={{ flex: 1 }}>
        <ScreenBackground />
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error || 'Post not available'}</Text>
          <GlassButton title="Back" onPress={() => navigation.goBack()} fullWidth={false} />
        </View>
      </View>
    );
  }

  const imageUri = absoluteUrl(post.image_path);
  const isMine = user?.id === post.author?.id;

  return (
    <View style={{ flex: 1 }}>
      <ScreenBackground />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
      >
        <FlatList
          ref={listRef}
          data={comments}
          keyExtractor={(c) => String(c.id)}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <View>
              <View style={styles.header}>
                <Pressable
                  onPress={() =>
                    post.author
                      ? navigation.navigate('PublicProfile', {
                          userId: post.author.id,
                        })
                      : undefined
                  }
                  style={styles.authorRow}
                >
                  <Avatar
                    url={post.author?.avatar_url}
                    name={post.author?.full_name}
                    username={post.author?.username}
                    size={44}
                  />
                  <View style={{ flex: 1, marginLeft: spacing.md }}>
                    <Text style={styles.authorName}>
                      {post.author?.full_name || post.author?.username}
                    </Text>
                    <Text style={styles.metaLine}>
                      @{post.author?.username} · {relativeTime(post.created_at)}
                    </Text>
                  </View>
                  {isMine ? (
                    <Pressable
                      onPress={handleDeletePost}
                      style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, padding: 8 })}
                      hitSlop={8}
                    >
                      <Ionicons
                        name="trash-outline"
                        size={20}
                        color={colors.danger}
                      />
                    </Pressable>
                  ) : null}
                </Pressable>
              </View>

              {imageUri ? (
                <Image source={{ uri: imageUri }} style={styles.image} resizeMode="cover" />
              ) : null}

              {post.caption ? (
                <Text style={styles.caption}>{post.caption}</Text>
              ) : null}

              {post.items.length > 0 ? (
                <View style={styles.taggedSection}>
                  <Text style={styles.sectionLabel}>Tagged</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.itemRow}
                  >
                    {post.items.map((it) => {
                      const uri = itemImageUrl(it.thumbnail_path || it.image_path);
                      return (
                        <View key={it.id} style={styles.itemCard}>
                          {uri ? (
                            <Image source={{ uri }} style={styles.itemThumb} />
                          ) : (
                            <View style={[styles.itemThumb, styles.placeholder]} />
                          )}
                          <Text style={styles.itemLabel} numberOfLines={1}>
                            {it.subcategory || it.category}
                          </Text>
                        </View>
                      );
                    })}
                  </ScrollView>
                </View>
              ) : null}

              <View style={styles.reactionsRow}>
                {REACTION_OPTIONS.map((emoji) => {
                  const summary = post.reactions.find((r) => r.emoji === emoji);
                  const mine = !!summary?.mine;
                  const count = summary?.count ?? 0;
                  return (
                    <Pressable
                      key={emoji}
                      onPress={() => handleReact(emoji)}
                      style={({ pressed }) => [
                        styles.reactBtn,
                        mine && styles.reactBtnActive,
                        { transform: [{ scale: pressed ? 0.92 : 1 }] },
                      ]}
                    >
                      <Text style={styles.reactEmoji}>{emoji}</Text>
                      {count > 0 ? (
                        <Text
                          style={[
                            styles.reactCount,
                            mine && styles.reactCountActive,
                          ]}
                        >
                          {count}
                        </Text>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.sectionLabel}>
                Comments · {post.comment_count}
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const mine = item.author.id === user?.id;
            const canDelete = mine || post.author?.id === user?.id;
            return (
              <GlassCard padded style={styles.commentCard}>
                <View style={styles.commentHeader}>
                  <Pressable
                    onPress={() =>
                      navigation.navigate('PublicProfile', {
                        userId: item.author.id,
                      })
                    }
                  >
                    <Avatar
                      url={item.author.avatar_url}
                      name={item.author.full_name}
                      username={item.author.username}
                      size={32}
                    />
                  </Pressable>
                  <View style={{ flex: 1, marginLeft: spacing.sm }}>
                    <Text style={styles.commentAuthor}>
                      {item.author.full_name || item.author.username}
                    </Text>
                    <Text style={styles.commentTime}>
                      {relativeTime(item.created_at)}
                    </Text>
                  </View>
                  {canDelete ? (
                    <Pressable
                      onPress={() => handleDeleteComment(item.id)}
                      hitSlop={8}
                    >
                      <Ionicons
                        name="close"
                        size={16}
                        color={colors.textMuted}
                      />
                    </Pressable>
                  ) : null}
                </View>
                <Text style={styles.commentBody}>{item.body}</Text>
              </GlassCard>
            );
          }}
          ListEmptyComponent={
            <Text style={styles.emptyHint}>Be the first to comment.</Text>
          }
        />

        <View style={styles.inputBar}>
          <GlassInputContainer style={styles.inputContainer}>
            <View style={styles.inputRow}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder="Add a comment…"
                placeholderTextColor={colors.placeholder}
                style={styles.input}
                multiline
                maxLength={1000}
              />
              <Pressable
                onPress={submitComment}
                disabled={posting || draft.trim().length === 0}
                style={({ pressed }) => [
                  styles.sendBtn,
                  {
                    opacity:
                      pressed || posting || draft.trim().length === 0
                        ? 0.5
                        : 1,
                  },
                ]}
              >
                <Ionicons name="arrow-up" size={18} color="#fff" />
              </Pressable>
            </View>
          </GlassInputContainer>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const HEADER_PAD = Platform.OS === 'ios' ? 96 : 60;

function makeStyles({
  colors,
  surface,
}: {
  colors: ThemeColors;
  surface: ThemeSurface;
}) {
  return StyleSheet.create({
    centered: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: spacing.xl,
    },
    errorText: {
      color: colors.danger,
      marginBottom: spacing.lg,
      fontSize: 15,
    },
    list: {
      paddingTop: HEADER_PAD,
      paddingHorizontal: spacing.lg,
      paddingBottom: 100,
    },
    header: {
      marginBottom: spacing.md,
    },
    authorRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    authorName: {
      ...typography.bodyMedium,
      color: colors.text,
    },
    metaLine: {
      fontSize: 12,
      color: colors.textMuted,
      marginTop: 2,
    },
    image: {
      width: '100%',
      aspectRatio: 4 / 5,
      borderRadius: radii.lg,
      backgroundColor: surface.thumbBg,
      ...shadow.card,
    },
    placeholder: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    caption: {
      ...typography.body,
      color: colors.text,
      marginTop: spacing.md,
      lineHeight: 22,
    },
    taggedSection: {
      marginTop: spacing.lg,
    },
    sectionLabel: {
      ...typography.micro,
      color: colors.textSecondary,
      marginTop: spacing.lg,
      marginBottom: spacing.sm,
    },
    itemRow: {
      gap: 8,
    },
    itemCard: {
      width: 80,
      alignItems: 'center',
    },
    itemThumb: {
      width: 72,
      height: 72,
      borderRadius: radii.sm,
      backgroundColor: surface.thumbBg,
    },
    itemLabel: {
      fontSize: 11,
      color: colors.textSecondary,
      marginTop: 4,
      textAlign: 'center',
    },
    reactionsRow: {
      flexDirection: 'row',
      gap: 8,
      marginTop: spacing.md,
      flexWrap: 'wrap',
    },
    reactBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 7,
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
      fontSize: 16,
    },
    reactCount: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    reactCountActive: {
      color: colors.accent,
    },
    commentCard: {
      marginBottom: spacing.sm,
      padding: spacing.md,
    },
    commentHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 6,
    },
    commentAuthor: {
      ...typography.bodyMedium,
      color: colors.text,
      fontSize: 14,
    },
    commentTime: {
      fontSize: 11,
      color: colors.textMuted,
      marginTop: 1,
    },
    commentBody: {
      ...typography.body,
      color: colors.text,
      lineHeight: 20,
    },
    emptyHint: {
      textAlign: 'center',
      color: colors.textMuted,
      paddingVertical: spacing.lg,
    },
    inputBar: {
      position: 'absolute',
      bottom: Platform.OS === 'ios' ? 20 : 12,
      left: spacing.lg,
      right: spacing.lg,
    },
    inputContainer: {
      minHeight: 48,
    },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    input: {
      flex: 1,
      color: colors.text,
      fontSize: 15,
      paddingVertical: 8,
      maxHeight: 100,
    },
    sendBtn: {
      width: 36,
      height: 36,
      borderRadius: radii.pill,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: 8,
      marginBottom: 4,
    },
  });
}
