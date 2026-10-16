import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { greetingFor, orderForDisplay, outfitReasons } from '../utils/today';
import type { ClothingItem, WeatherContext } from '../api/types';

// ---- pure helpers ----------------------------------------------------------

const item = (id: number, sub: string, category: string, extra: Partial<ClothingItem> = {}) =>
  ({ id, subcategory: sub, category, colors: ['Black'], ...extra }) as ClothingItem;

const NOW = new Date('2026-10-16T12:00:00Z');
const daysAgo = (n: number) =>
  new Date(NOW.getTime() - n * 86_400_000).toISOString().slice(0, 19).replace('T', ' ');

describe('greetingFor', () => {
  it('uses time of day and first name', () => {
    expect(greetingFor(new Date(2026, 9, 16, 8), 'Rohin Patel')).toBe('Good morning, Rohin');
    expect(greetingFor(new Date(2026, 9, 16, 14), 'rohin')).toBe('Good afternoon, rohin');
    expect(greetingFor(new Date(2026, 9, 16, 20))).toBe('Good evening');
  });
});

describe('outfitReasons', () => {
  it('calls out a first wear', () => {
    const r = outfitReasons([item(1, 'Top', 'Shirt', { last_worn: daysAgo(1) }), item(2, 'Bottom', 'Jeans')], null, NOW);
    expect(r[0]).toBe('First wear for your jeans');
  });

  it('calls out the longest-rested piece in weeks', () => {
    const r = outfitReasons(
      [item(1, 'Top', 'Shirt', { last_worn: daysAgo(15) }), item(2, 'Bottom', 'Jeans', { last_worn: daysAgo(30) })],
      null,
      NOW
    );
    expect(r[0]).toBe('4 weeks since your jeans');
  });

  it('matches the weather and favorites, capped at three', () => {
    const w = { cold: true, rainy: true, snowy: false, hot: false, windy: false, condition: 'Rain' } as WeatherContext;
    const r = outfitReasons(
      [
        item(1, 'Top', 'Coat', { last_worn: daysAgo(2), is_favorite: true }),
        item(2, 'Footwear', 'Boots', { last_worn: daysAgo(2) }),
      ],
      w,
      NOW
    );
    expect(r).toEqual(['Warm layer for the cold', 'Rain-ready', 'Includes a favorite']);
  });
});

it('orders tops before bottoms, shoes and accessories', () => {
  const ordered = orderForDisplay([
    { id: 1, subcategory: 'Footwear' },
    { id: 2, subcategory: 'Bottom' },
    { id: 3, subcategory: 'Accessory' },
    { id: 4, subcategory: 'Top' },
  ]);
  expect(ordered.map((i) => i.id)).toEqual([4, 2, 1, 3]);
});

// ---- screen ------------------------------------------------------------------

jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  const Ionicons = ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text>;
  Ionicons.glyphMap = {};
  return { Ionicons };
});

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => {
  const ReactLib = require('react');
  return {
    useNavigation: () => ({ navigate: mockNavigate }),
    useFocusEffect: (cb: () => void) => ReactLib.useEffect(cb, [cb]),
  };
});
jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, username: 'rohin', full_name: 'Rohin Patel' } }),
}));
jest.mock('../weather', () => ({
  getWeatherSyncEnabled: jest.fn(async () => false),
  setWeatherSyncEnabled: jest.fn(async () => {}),
  requestCurrentCoordinates: jest.fn(),
  weatherHeadline: () => '',
}));
jest.mock('../api/client', () => ({
  fetchOutfitRecommendations: jest.fn(),
  fetchTodaysOutfit: jest.fn(),
  fetchPlannedOutfits: jest.fn(),
  fetchCloset: jest.fn(),
  wearOutfit: jest.fn(),
}));

import * as api from '../api/client';
import { ThemeProvider } from '../context/ThemeContext';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { TodayScreen } from '../screens/TodayScreen';

const shirt = item(11, 'Top', 'Shirt', { last_worn: null });
const jeans = item(12, 'Bottom', 'Jeans', { last_worn: daysAgo(3) });
const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };

function textOf(tree: renderer.ReactTestRenderer): string {
  const flat = (c: unknown): string =>
    Array.isArray(c) ? c.map(flat).join('') : typeof c === 'string' || typeof c === 'number' ? String(c) : '';
  return tree.root
    .findAll((n) => (n.type as unknown) === 'Text' || (n.type as { displayName?: string }).displayName === 'Text')
    .map((n) => flat(n.props.children))
    .filter(Boolean)
    .join(' | ');
}

async function renderToday() {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <SafeAreaProvider initialMetrics={metrics}>
        <ThemeProvider>
          <TodayScreen />
        </ThemeProvider>
      </SafeAreaProvider>
    );
  });
  return tree;
}

beforeEach(() => {
  jest.clearAllMocks();
  (api.fetchPlannedOutfits as jest.Mock).mockResolvedValue({ plans: [] });
  (api.fetchTodaysOutfit as jest.Mock).mockResolvedValue({ outfit: null });
  (api.fetchCloset as jest.Mock).mockResolvedValue({ items: [] });
});

it('shows suggestions and logs the chosen outfit', async () => {
  (api.fetchOutfitRecommendations as jest.Mock).mockResolvedValue({
    outfits: [{ items: [shirt, jeans], score: 70, occasion: 'casual' }],
    weather: null,
  });
  (api.wearOutfit as jest.Mock).mockResolvedValue({
    success: true,
    outfit: { id: 5, occasion: 'casual', worn_at: '2026-10-16 08:12:00', items: [shirt, jeans] },
  });

  const tree = await renderToday();
  expect(textOf(tree)).toContain('First wear for your shirt');
  expect(textOf(tree)).toContain('Dress for today’s weather');

  const wear = tree.root.find((n) => n.props.testID === 'today-wear' && typeof n.props.onPress === 'function');
  await act(async () => {
    await wear.props.onPress();
  });
  expect(api.wearOutfit).toHaveBeenCalledWith([11, 12], 'casual');
  expect(textOf(tree)).toContain('Wearing today');
});

it('points an empty closet at Quick add', async () => {
  (api.fetchOutfitRecommendations as jest.Mock).mockResolvedValue({ outfits: [], weather: null });
  const tree = await renderToday();
  expect(textOf(tree)).toContain('Nothing to suggest yet');
  const add = tree.root.find((n) => n.props.title === 'Add clothes');
  await act(async () => add.props.onPress());
  expect(mockNavigate).toHaveBeenCalledWith('QuickAdd');
});

it('shows what is already logged today', async () => {
  (api.fetchOutfitRecommendations as jest.Mock).mockResolvedValue({ outfits: [], weather: null });
  (api.fetchTodaysOutfit as jest.Mock).mockResolvedValue({
    outfit: { id: 9, worn_at: '2026-10-16 07:00:00', items: [shirt, jeans] },
  });
  const tree = await renderToday();
  expect(textOf(tree)).toContain('Wearing today');
});

it('says when everything is in the wash instead of asking for more clothes', async () => {
  (api.fetchOutfitRecommendations as jest.Mock).mockResolvedValue({ outfits: [], weather: null });
  (api.fetchCloset as jest.Mock).mockResolvedValue({
    items: [{ ...shirt, laundry_state: 'worn' }, { ...jeans, laundry_state: 'in_hamper' }, { ...jeans, id: 13, laundry_state: 'clean' }],
  });
  const tree = await renderToday();
  expect(textOf(tree)).toContain('Everything’s in the wash');
  expect(textOf(tree)).toContain('2 pieces are waiting on laundry');
  const open = tree.root.find((n) => n.props.title === 'Open closet');
  await act(async () => open.props.onPress());
  expect(mockNavigate).toHaveBeenCalledWith('ClosetTab');
});
