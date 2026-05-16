import type { EdgeInsets } from 'react-native-safe-area-context';
import { spacing } from '../theme';

export function tabTopPadding(insets: EdgeInsets): number {
  return insets.top + 16;
}

export function stackTopPadding(insets: EdgeInsets): number {
  return insets.top + 56;
}

/**
 * ScrollView contentContainerStyle.paddingBottom when the floating tab bar
 * is visible (main tabs).
 */
export const TAB_SCREEN_SCROLL_BOTTOM = 132;

/**
 * Stack screens with transparent header — room above home indicator.
 */
export const STACK_SCREEN_SCROLL_BOTTOM = 124;

/**
 * Pack Mode list: extra space for bottom bulk-action strip.
 */
export const PACK_MODE_SCROLL_BOTTOM = 180;

export function tabScrollContentPaddingTop(insets: EdgeInsets): number {
  return tabTopPadding(insets) + spacing.xs;
}

export function stackScrollContentPaddingTop(insets: EdgeInsets): number {
  return stackTopPadding(insets) + spacing.xs;
}
