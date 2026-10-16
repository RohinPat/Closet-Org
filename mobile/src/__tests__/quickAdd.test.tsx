import React from 'react';
import renderer, { act } from 'react-test-renderer';
import {
  QUICK_ADD_LIMIT,
  itemLabel,
  nextToUpload,
  quickAddReducer,
  quickAddSummary,
  type QuickAddEntry,
} from '../utils/quickAddQueue';

// ---- queue logic -----------------------------------------------------------

const add = (n: number, from: QuickAddEntry<number>[] = []) =>
  quickAddReducer(from, {
    type: 'add',
    assets: Array.from({ length: n }, (_, i) => ({ asset: i, previewUri: `file://${i}.jpg` })),
  });

describe('quickAddReducer', () => {
  it('caps a batch at the limit', () => {
    expect(add(QUICK_ADD_LIMIT + 5)).toHaveLength(QUICK_ADD_LIMIT);
    expect(add(5, add(QUICK_ADD_LIMIT - 2))).toHaveLength(QUICK_ADD_LIMIT);
  });

  it('uploads one at a time, in order', () => {
    let q = add(3);
    expect(nextToUpload(q)?.asset).toBe(0);
    q = quickAddReducer(q, { type: 'start', key: q[0].key });
    expect(nextToUpload(q)).toBeNull(); // one already running
    q = quickAddReducer(q, { type: 'succeed', key: q[0].key, itemId: 9, label: 'Blue Jeans' });
    expect(nextToUpload(q)?.asset).toBe(1);
  });

  it('retries failures and summarizes progress', () => {
    let q = add(2);
    q = quickAddReducer(q, { type: 'fail', key: q[0].key, error: 'offline' });
    q = quickAddReducer(q, { type: 'start', key: q[1].key });
    q = quickAddReducer(q, { type: 'succeed', key: q[1].key, itemId: 1, label: 'x' });
    expect(quickAddSummary(q)).toEqual({ total: 2, done: 1, failed: 1, pending: 0, finished: true });
    q = quickAddReducer(q, { type: 'retryFailed' });
    expect(quickAddSummary(q)).toMatchObject({ failed: 0, pending: 1, finished: false });
  });

  it('labels items from the classification', () => {
    expect(itemLabel({ category: 'Jeans', colors: ['Blue', 'Black'] })).toBe('Blue Jeans');
    expect(itemLabel({ category: 'Boots' })).toBe('Boots');
    expect(itemLabel(null)).toBe('Item');
  });
});

// ---- screen ------------------------------------------------------------------

jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  const Ionicons = ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text>;
  Ionicons.glyphMap = {};
  return { Ionicons };
});
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchImageLibraryAsync: jest.fn(async () => ({
    canceled: false,
    assets: [{ uri: 'file://a.jpg' }, { uri: 'file://b.jpg' }, { uri: 'file://c.jpg' }],
  })),
  UIImagePickerPreferredAssetRepresentationMode: { Compatible: 'compatible' },
}));
jest.mock('../utils/imageUpload', () => ({
  imagePickerAssetToUpload: jest.fn(async (a: { uri: string }) => ({ uri: a.uri, filename: 'x.jpg', mimeType: 'image/jpeg' })),
}));
const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, addListener: () => () => {}, dispatch: jest.fn() }),
}));
jest.mock('../api/client', () => ({ uploadClothing: jest.fn(), fetchItem: jest.fn() }));

import * as api from '../api/client';
import { ThemeProvider } from '../context/ThemeContext';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QuickAddScreen } from '../screens/QuickAddScreen';

function textOf(tree: renderer.ReactTestRenderer): string {
  const flat = (c: unknown): string =>
    Array.isArray(c) ? c.map(flat).join('') : typeof c === 'string' || typeof c === 'number' ? String(c) : '';
  return tree.root
    .findAll((n) => (n.type as unknown) === 'Text' || (n.type as { displayName?: string }).displayName === 'Text')
    .map((n) => flat(n.props.children))
    .filter(Boolean)
    .join(' | ');
}

const flush = async () => {
  for (let i = 0; i < 12; i++) await act(async () => { await Promise.resolve(); });
};

it('uploads every picked photo as its own item, and retries a failure', async () => {
  let calls = 0;
  (api.uploadClothing as jest.Mock).mockImplementation(async (photos: { uri: string }[]) => {
    calls += 1;
    if (calls === 2) throw new Error('Network request failed');
    const color = { 'file://a.jpg': 'Blue', 'file://b.jpg': 'Black', 'file://c.jpg': 'White' }[photos[0].uri];
    return { item_id: calls, classification: { category: 'Shirt', colors: [color] }, thumbnail_url: null };
  });

  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
        <ThemeProvider><QuickAddScreen /></ThemeProvider>
      </SafeAreaProvider>
    );
  });
  const pick = tree.root.find((n) => n.props.testID === 'quick-add-pick' && typeof n.props.onPress === 'function');
  await act(async () => { await pick.props.onPress(); });
  await flush();

  // One photo per request, in order; the second failed.
  expect((api.uploadClothing as jest.Mock).mock.calls.map((c) => c[0].length)).toEqual([1, 1, 1]);
  expect(textOf(tree)).toContain('2 pieces added · 1 failed');
  expect(textOf(tree)).toContain('Blue Shirt');
  expect(textOf(tree)).toContain('Tap to retry');

  const retry = tree.root.find((n) => n.props.title === 'Retry failed');
  await act(async () => { retry.props.onPress(); });
  await flush();
  expect(textOf(tree)).toContain('3 pieces added');
  expect(textOf(tree)).toContain('Black Shirt');

  const done = tree.root.find((n) => n.props.testID === 'quick-add-done' && typeof n.props.onPress === 'function');
  await act(async () => done.props.onPress());
  expect(mockNavigate).toHaveBeenCalledWith('MainTabs', { screen: 'TodayTab' });
});
