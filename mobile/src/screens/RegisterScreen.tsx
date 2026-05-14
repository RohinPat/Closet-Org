import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../navigation/RootNavigator';
import { useAuth } from '../context/AuthContext';
import { GlassButton, GlassCard, GlassInputContainer } from '../components/Glass';
import { colors, spacing, typography } from '../theme';

type Props = NativeStackScreenProps<AuthStackParamList, 'Register'>;

export function RegisterScreen({ navigation }: Props) {
  const { signUp } = useAuth();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    setError(null);
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (!username.trim() || !email.trim()) {
      setError('Username and email are required.');
      return;
    }
    setBusy(true);
    try {
      await signUp({
        username: username.trim(),
        email: email.trim(),
        password,
        full_name: fullName.trim() || null,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Registration failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Join Closet Org</Text>
        <Text style={styles.subtitle}>
          A few details and your closet is ready.
        </Text>

        <GlassCard padded style={styles.card}>
          {[
            {
              key: 'u',
              placeholder: 'Username',
              value: username,
              setter: setUsername,
              autoCap: 'none' as const,
            },
            {
              key: 'e',
              placeholder: 'Email',
              value: email,
              setter: setEmail,
              autoCap: 'none' as const,
              keyboard: 'email-address' as const,
            },
            {
              key: 'n',
              placeholder: 'Full name (optional)',
              value: fullName,
              setter: setFullName,
            },
            {
              key: 'p',
              placeholder: 'Password',
              value: password,
              setter: setPassword,
              secure: true,
            },
            {
              key: 'c',
              placeholder: 'Confirm password',
              value: confirm,
              setter: setConfirm,
              secure: true,
            },
          ].map((f) => (
            <GlassInputContainer key={f.key} style={styles.input}>
              <TextInput
                style={styles.textInput}
                placeholder={f.placeholder}
                placeholderTextColor={colors.placeholder}
                autoCapitalize={f.autoCap}
                autoCorrect={false}
                keyboardType={f.keyboard}
                secureTextEntry={f.secure}
                value={f.value}
                onChangeText={f.setter}
              />
            </GlassInputContainer>
          ))}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <GlassButton
            title="Create account"
            onPress={onSubmit}
            loading={busy}
            style={styles.submit}
          />

          <Pressable
            style={styles.linkWrap}
            onPress={() => navigation.goBack()}
            disabled={busy}
          >
            <Text style={styles.link}>Already have an account? Sign in</Text>
          </Pressable>
        </GlassCard>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    paddingHorizontal: spacing.xl,
    paddingTop: 96,
    paddingBottom: spacing.xxl,
  },
  title: {
    ...typography.title,
    color: colors.text,
    marginBottom: 6,
  },
  subtitle: {
    ...typography.callout,
    color: colors.textSecondary,
    marginBottom: spacing.xl,
  },
  card: {
    padding: spacing.lg,
  },
  input: {
    marginBottom: spacing.md,
  },
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
  submit: {
    marginTop: spacing.sm,
  },
  linkWrap: {
    marginTop: spacing.lg,
    alignItems: 'center',
  },
  link: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: '600',
  },
});
