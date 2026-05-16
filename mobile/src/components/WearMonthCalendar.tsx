import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { WearHistoryEntry } from '../api/types';
import { spacing, typography, type ThemeColors, type ThemeSurface } from '../theme';

function parseWearDateKey(raw: string): string | null {
  if (!raw) return null;
  const s = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const slice = s.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(slice) ? slice : null;
}

function monthMatrix(year: number, monthZero: number): (number | null)[][] {
  const first = new Date(year, monthZero, 1);
  const last = new Date(year, monthZero + 1, 0);
  const startPad = first.getDay(); // Sun=0
  const daysInMonth = last.getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  while (cells.length < 42) cells.push(null);
  const rows: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    rows.push(cells.slice(i, i + 7));
  }
  return rows;
}

type Props = {
  entries: WearHistoryEntry[];
  colors: ThemeColors;
  surface: ThemeSurface;
};

export function WearMonthCalendar({ entries, colors, surface }: Props) {
  const countsByDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of entries) {
      const k = parseWearDateKey(e.worn_date || '');
      if (!k) continue;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [entries]);

  const maxWearInMonth = useMemo(() => Math.max(1, ...countsByDay.values()), [countsByDay]);

  const lastWear = useMemo(() => {
    for (const e of entries) {
      const k = parseWearDateKey(e.worn_date || '');
      if (k) return k;
    }
    return null;
  }, [entries]);

  const [cursor, setCursor] = useState(() => {
    if (lastWear) {
      const [y, m] = lastWear.split('-').map(Number);
      return new Date(y, (m ?? 1) - 1, 1);
    }
    return new Date();
  });

  const y = cursor.getFullYear();
  const m0 = cursor.getMonth();
  const matrix = useMemo(() => monthMatrix(y, m0), [y, m0]);

  const label = cursor.toLocaleString(undefined, { month: 'long', year: 'numeric' });

  function bump(delta: number) {
    setCursor(new Date(y, m0 + delta, 1));
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.toolbar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          onPress={() => bump(-1)}
          hitSlop={10}
          style={({ pressed }) => [styles.navBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Pressable>
        <Text style={[styles.monthLabel, { color: colors.text }]}>{label}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next month"
          onPress={() => bump(1)}
          hitSlop={10}
          style={({ pressed }) => [styles.navBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Ionicons name="chevron-forward" size={20} color={colors.text} />
        </Pressable>
      </View>
      <View style={styles.dowRow}>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <Text key={`${d}-${i}`} style={[styles.dowCell, { color: colors.textMuted }]}>
            {d}
          </Text>
        ))}
      </View>
      {matrix.map((row, ri) => (
        <View key={ri} style={styles.weekRow}>
          {row.map((day, ci) => {
            if (day == null) {
              return <View key={ci} style={styles.dayCellEmpty} />;
            }
            const key = `${y}-${String(m0 + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const n = countsByDay.get(key) ?? 0;
            const intensity =
              n === 0
                ? 0
                : 0.35 + (0.65 * Math.min(n, maxWearInMonth)) / maxWearInMonth;
            const bg =
              n > 0 ? blendHex(colors.bg, colors.accent, intensity) : surface.chipInactive;
            return (
              <View key={ci} style={styles.dayCellOuter}>
                <View
                  style={[
                    styles.dayCellInner,
                    { backgroundColor: bg, borderColor: surface.cardBorder },
                  ]}
                >
                  <Text style={[styles.dayNum, { color: n > 0 ? '#fff' : colors.textSecondary }]}>
                    {day}
                  </Text>
                  {n > 1 ? (
                    <Text style={[styles.dayCount, { color: '#fff' }]}>{n}</Text>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/** Linear blend toward accent for heat squares (assume hex ``bgHex``). */
function blendHex(fromHex: string, toHex: string, t: number): string {
  const base = rgb(fromHex);
  const target = rgb(toHex);
  const u = Math.max(0, Math.min(1, t));
  const r = Math.round(base.r + (target.r - base.r) * u);
  const g = Math.round(base.g + (target.g - base.g) * u);
  const b = Math.round(base.b + (target.b - base.b) * u);
  return `rgb(${r},${g},${b})`;
}

function rgb(hex: string): { r: number; g: number; b: number } {
  let h = hex.replace('#', '');
  if (/^rgba?\(/i.test(hex)) {
    const m = hex.match(/\d+(\.\d+)?/g);
    if (!m || m.length < 3) return { r: 245, g: 248, b: 250 };
    return {
      r: Math.min(255, parseFloat(m[0])),
      g: Math.min(255, parseFloat(m[1])),
      b: Math.min(255, parseFloat(m[2])),
    };
  }
  if (h.length === 3) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  }
  const n = parseInt(h || 'FFFFFF', 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: spacing.sm,
    alignSelf: 'stretch',
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  navBtn: {
    padding: spacing.xs,
  },
  monthLabel: {
    ...typography.headline,
    fontWeight: '700',
  },
  dowRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  dowCell: {
    width: `${100 / 7}%`,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '600',
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  dayCellEmpty: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    maxHeight: 40,
  },
  dayCellOuter: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    maxHeight: 40,
    padding: 2,
  },
  dayCellInner: {
    flex: 1,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNum: {
    fontSize: 12,
    fontWeight: '600',
  },
  dayCount: {
    fontSize: 9,
    fontWeight: '700',
    marginTop: -2,
  },
});
