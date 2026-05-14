import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as api from '../api/client';

function inferMime(uri: string): string {
  const lower = uri.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.heic') || lower.endsWith('.heif')) return 'image/heic';
  return 'image/jpeg';
}

function inferFilename(uri: string, mime: string): string {
  const base = uri.split('/').pop()?.split('?')[0];
  if (base && base.includes('.')) return base;
  const ext = mime.includes('png') ? 'png' : 'jpg';
  return `upload.${ext}`;
}

export function UploadScreen() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pickAndUpload(useCamera: boolean) {
    setError(null);
    setResult(null);

    if (useCamera) {
      const cam = await ImagePicker.requestCameraPermissionsAsync();
      if (!cam.granted) {
        setError('Camera permission is required.');
        return;
      }
    } else {
      const lib = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!lib.granted) {
        setError('Photo library permission is required.');
        return;
      }
    }

    const picked = useCamera
      ? await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          quality: 0.85,
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 0.85,
        });

    if (picked.canceled || !picked.assets?.[0]) return;

    const asset = picked.assets[0];
    const uri = asset.uri;
    const mime = asset.mimeType || inferMime(uri);
    const filename = inferFilename(uri, mime);

    setBusy(true);
    try {
      const data = await api.uploadClothing(uri, filename, mime);
      const c = data.classification as {
        category?: string;
        subcategory?: string;
        style?: string;
        season?: string;
        colors?: string[];
      };
      setResult(
        `Saved as #${data.item_id}\n${c.category ?? ''} · ${c.subcategory ?? ''}\n` +
          `${c.style ?? ''} · ${c.season ?? ''}\nColors: ${(c.colors ?? []).join(', ')}`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.blurb}>
        Choose a photo of one clothing item. The server runs classification and
        stores it in your closet.
      </Text>

      <Pressable
        style={[styles.button, busy && styles.disabled]}
        onPress={() => pickAndUpload(false)}
        disabled={busy}
      >
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Pick from library</Text>
        )}
      </Pressable>

      <Pressable
        style={[styles.buttonSecondary, busy && styles.disabled]}
        onPress={() => pickAndUpload(true)}
        disabled={busy}
      >
        <Text style={styles.buttonSecondaryText}>Take photo</Text>
      </Pressable>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {result ? <Text style={styles.result}>{result}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    paddingBottom: 40,
    backgroundColor: '#fff',
  },
  blurb: {
    fontSize: 15,
    color: '#4b5563',
    marginBottom: 24,
    lineHeight: 22,
  },
  button: {
    backgroundColor: '#4f46e5',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 12,
  },
  buttonSecondary: {
    borderWidth: 1,
    borderColor: '#4f46e5',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 12,
  },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  buttonSecondaryText: { color: '#4f46e5', fontWeight: '600', fontSize: 16 },
  disabled: { opacity: 0.7 },
  error: { color: '#dc2626', marginTop: 16, fontSize: 14 },
  result: {
    marginTop: 20,
    fontSize: 15,
    color: '#111827',
    lineHeight: 22,
    backgroundColor: '#f3f4f6',
    padding: 14,
    borderRadius: 10,
  },
});
