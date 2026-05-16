import type { EdgeInsets } from 'react-native-safe-area-context';

export function tabTopPadding(insets: EdgeInsets): number {
  return insets.top + 16;
}

export function stackTopPadding(insets: EdgeInsets): number {
  return insets.top + 56;
}
