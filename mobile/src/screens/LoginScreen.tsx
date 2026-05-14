import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../navigation/RootNavigator';
import { useAuth } from '../context/AuthContext';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import {
  GlassButton,
  GlassCard,
  GlassInputContainer,
  ScreenBackground,
} from '../components/Glass';
import { spacing, typography, type ThemeColors } from '../theme';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  const { signIn } = useAuth();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    setError(null);
    if (!username.trim() || !password) {
      setError('Enter username and password.');
      return;
    }
    setBusy(true);
    try {
      await signIn(username.trim(), password);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign in failed');
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
            <View style={styles.brandWrap}>
              <Text style={styles.brand}>Closet</Text>
              <Text style={styles.brandAccent}>Org</Text>
            </View>
            <Text style={styles.subtitle}>Welcome back to your closet</Text>

            <GlassCard padded style={styles.card}>
              <GlassInputContainer style={styles.input}>
                <TextInput
                  style={styles.textInput}
                  placeholder="Username"
                  placeholderTextColor={colors.placeholder}
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={username}
                  onChangeText={setUsername}
                />
              </GlassInputContainer>
              <GlassInputContainer style={styles.input}>
                <TextInput
                  style={styles.textInput}
                  placeholder="Password"
                  placeholderTextColor={colors.placeholder}
                  secureTextEntry
                  value={password}
                  onChangeText={setPassword}
                />
              </GlassInputContainer>

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <GlassButton
                title="Sign in"
                onPress={onSubmit}
                loading={busy}
                style={styles.submit}
              />

              <GlassButton
                title="Create an account"
                onPress={() => navigation.navigate('Register')}
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
      justifyContent: 'center',
    },
    brandWrap: {
      flexDirection: 'row',
      alignItems: 'baseline',
      marginBottom: spacing.sm,
    },
    brand: {
      ...typography.largeTitle,
      color: colors.text,
    },
    brandAccent: {
      ...typography.largeTitle,
      color: colors.accent,
      marginLeft: 6,
    },
    subtitle: {
      ...typography.callout,
      color: colors.textSecondary,
      marginBottom: spacing.xxl,
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
    secondary: {
      marginTop: spacing.md,
    },
  });
}
