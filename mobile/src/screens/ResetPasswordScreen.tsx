import React, { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as api from '../api/client';
import type { AuthStackParamList } from '../navigation/RootNavigator';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import {
  GlassButton,
  GlassCard,
  GlassInputContainer,
  ScreenBackground,
} from '../components/Glass';
import { spacing, typography, type ThemeColors } from '../theme';

type Props = NativeStackScreenProps<AuthStackParamList, 'ResetPassword'>;

export function ResetPasswordScreen({ navigation, route }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [token, setToken] = useState(route.params?.token ?? '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = route.params?.token;
    if (t) setToken(t);
  }, [route.params?.token]);

  async function onSubmit() {
    setError(null);
    if (!token.trim()) {
      setError('Paste the reset token from your email (or dev flow).');
      return;
    }
    if (password.length < 10) {
      setError(
        'Password must be at least 10 characters (upper, lower, digit, symbol).'
      );
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const data = await api.resetPasswordWithToken(token.trim(), password);
      Alert.alert('Success', data.message, [
        { text: 'Sign in', onPress: () => navigation.navigate('Login') },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Reset failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <ScreenBackground />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.container}>
            <Text style={styles.title}>New password</Text>
            <Text style={styles.subtitle}>
              Paste the token from the reset email, then choose a new password
              (10+ characters with upper, lower, number, and symbol).
            </Text>

            <GlassCard padded>
              <GlassInputContainer style={styles.input}>
                <TextInput
                  accessibilityLabel="Reset token"
                  style={styles.textInput}
                  placeholder="Reset token"
                  placeholderTextColor={colors.placeholder}
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={token}
                  onChangeText={setToken}
                />
              </GlassInputContainer>
              <GlassInputContainer style={styles.input}>
                <TextInput
                  accessibilityLabel="New password"
                  style={styles.textInput}
                  placeholder="New password"
                  placeholderTextColor={colors.placeholder}
                  secureTextEntry
                  value={password}
                  onChangeText={setPassword}
                />
              </GlassInputContainer>
              <GlassInputContainer style={styles.input}>
                <TextInput
                  accessibilityLabel="Confirm new password"
                  style={styles.textInput}
                  placeholder="Confirm password"
                  placeholderTextColor={colors.placeholder}
                  secureTextEntry
                  value={confirm}
                  onChangeText={setConfirm}
                />
              </GlassInputContainer>

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <GlassButton
                title="Update password"
                onPress={onSubmit}
                loading={busy}
                style={styles.submit}
              />

              <GlassButton
                title="Back to sign in"
                onPress={() => navigation.navigate('Login')}
                variant="ghost"
                disabled={busy}
                style={styles.secondary}
              />
            </GlassCard>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

function makeStyles({ colors }: { colors: ThemeColors }) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: 'transparent' },
    flex: { flex: 1 },
    container: {
      flex: 1,
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.lg,
      justifyContent: 'center',
    },
    title: {
      ...typography.title,
      color: colors.text,
      marginBottom: spacing.sm,
    },
    subtitle: {
      ...typography.callout,
      color: colors.textSecondary,
      marginBottom: spacing.xxl,
    },
    input: { marginBottom: spacing.md },
    textInput: {
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 16,
      color: colors.text,
    },
    error: {
      color: colors.danger,
      marginBottom: spacing.sm,
      fontSize: 14,
    },
    submit: { marginTop: spacing.sm },
    secondary: { marginTop: spacing.md },
  });
}
