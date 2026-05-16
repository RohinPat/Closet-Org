import * as ExpoHaptics from 'expo-haptics';
import { Platform, Vibration } from 'react-native';

/** Light tactile feedback — prefers system haptics on iOS/Android, falls back to a short vibration. */
export async function hapticLight(): Promise<void> {
  try {
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      await ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Light);
    } else {
      Vibration.vibrate(10);
    }
  } catch {
    try {
      Vibration.vibrate(10);
    } catch {
      /* ignore */
    }
  }
}
