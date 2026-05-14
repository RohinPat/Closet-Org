import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { API_ORIGIN } from '../config';

export function ProfileScreen() {
  const { user, signOut } = useAuth();

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Signed in as</Text>
      <Text style={styles.name}>{user?.full_name || user?.username}</Text>
      <Text style={styles.meta}>{user?.email}</Text>

      <Text style={[styles.label, styles.spaced]}>API server</Text>
      <Text style={styles.api}>{API_ORIGIN}</Text>
      <Text style={styles.hint}>
        Set EXPO_PUBLIC_API_URL when starting Expo if this device cannot reach
        localhost (e.g. http://192.168.x.x:8000).
      </Text>

      <Pressable style={styles.button} onPress={signOut}>
        <Text style={styles.buttonText}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    backgroundColor: '#fff',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  spaced: { marginTop: 28 },
  name: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    marginTop: 6,
  },
  meta: { fontSize: 15, color: '#6b7280', marginTop: 4 },
  api: {
    fontSize: 14,
    color: '#374151',
    marginTop: 6,
    fontFamily: 'monospace',
  },
  hint: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 10,
    lineHeight: 18,
  },
  button: {
    marginTop: 32,
    backgroundColor: '#f3f4f6',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  buttonText: { color: '#374151', fontWeight: '600', fontSize: 16 },
});
