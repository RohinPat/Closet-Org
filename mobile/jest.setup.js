/* eslint-env jest */

jest.mock('expo-blur', () => {
  const mockReact = require('react');
  const { View } = require('react-native');
  return {
    BlurView: (props) =>
      mockReact.createElement(View, {
        ...props,
        testID: props.testID ?? 'mock-expo-blur',
      }),
  };
});

jest.mock('expo-linear-gradient', () => {
  const mockReact = require('react');
  const { View } = require('react-native');
  return {
    LinearGradient: (props) =>
      mockReact.createElement(View, {
        ...props,
        testID: props.testID ?? 'mock-expo-linear-gradient',
      }),
  };
});

jest.mock('expo-secure-store', () => ({
  getItem: jest.fn(() => null),
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}));

jest.mock('react-native-reanimated', () =>
  require('react-native-reanimated/mock')
);

jest.mock('react-native-gesture-handler', () => {
  const { View } = require('react-native');
  return {
    GestureHandlerRootView: View,
    Swipeable: ({ children }) => children ?? null,
  };
});

jest.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: { Light: 'light' },
  impactAsync: jest.fn(async () => {}),
}));
