import React, { useState } from 'react';
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

type Props = NativeStackScreenProps<AuthStackParamList, 'ForgotPassword'>;

export function ForgotPasswordScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    setError(null);
    if (!email.trim()) {
      setError('Enter the email for your account.');
      return;
    }
    setBusy(true);
    try {
      const data = await api.requestPasswordReset(email.trim());
      const devTok = data.dev_reset_token;
      if (devTok) {
        Alert.alert(
          'Check reset token',
          `${data.message}\n\nYour dev token was copied into the next screen.`,
          [
            {
              text: 'Continue',
              onPress: () =>
                navigation.navigate('ResetPassword', { token: devTok }),
            },
          ]
        );
      } else {
        Alert.alert('Reset requested', data.message, [
          {
            text: 'OK',
            onPress: () => navigation.navigate('ResetPassword', {}),
          },
        ]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
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
            <Text style={styles.title}>Forgot password</Text>
            <Text style={styles.subtitle}>
              We will email a reset link when SMTP is configured. In local dev,
              the server may return a token instead.
            </Text>

            <GlassCard padded>
              <GlassInputContainer style={styles.input}>
                <TextInput
                  accessibilityLabel="Email"
                  style={styles.textInput}
                  placeholder="Email"
                  placeholderTextColor={colors.placeholder}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  value={email}
                  onChangeText={setEmail}
                />
              </GlassInputContainer>

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <GlassButton
                title="Send reset link"
                onPress={onSubmit}
                loading={busy}
                style={styles.submit}
              />

              <GlassButton
                title="Enter reset code"
                onPress={() => navigation.navigate('ResetPassword', {})}
                variant="ghost"
                disabled={busy}
                style={styles.secondary}
              />

              <GlassButton
                title="Back to sign in"
                onPress={() => navigation.goBack()}
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
