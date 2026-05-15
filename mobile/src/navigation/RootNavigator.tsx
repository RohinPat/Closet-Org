import React, { useMemo } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import {
  NavigationContainer,
  DefaultTheme,
  DarkTheme,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors, ThemeSurface } from '../theme';
import type { ClothingItem } from '../api/types';
import { LoginScreen } from '../screens/LoginScreen';
import { RegisterScreen } from '../screens/RegisterScreen';
import { ClosetScreen } from '../screens/ClosetScreen';
import { UploadScreen } from '../screens/UploadScreen';
import { OutfitsScreen } from '../screens/OutfitsScreen';
import { StatsScreen } from '../screens/StatsScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { ItemDetailScreen } from '../screens/ItemDetailScreen';
import { WishlistScreen } from '../screens/WishlistScreen';
import { FeedScreen } from '../screens/FeedScreen';
import { FitDetailScreen } from '../screens/FitDetailScreen';
import { CreateFitScreen } from '../screens/CreateFitScreen';
import { FriendsScreen } from '../screens/FriendsScreen';
import { PublicProfileScreen } from '../screens/PublicProfileScreen';
import { shadow, typography } from '../theme';

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
};

export type MainTabParamList = {
  ClosetTab: undefined;
  FeedTab: undefined;
  UploadTab: undefined;
  OutfitsTab: undefined;
  ProfileTab: undefined;
};

export type AppStackParamList = {
  MainTabs: undefined;
  ItemDetail: { item: ClothingItem };
  Wishlist: undefined;
  Stats: undefined;
  Friends: undefined;
  CreateFit: undefined;
  FitDetail: { postId: number };
  PublicProfile: { userId: number };
};

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const AppStack = createNativeStackNavigator<AppStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

function GlassTabBarBackground({ surface }: { surface: ThemeSurface }) {
  return (
    <View style={StyleSheet.absoluteFill}>
      <BlurView
        intensity={Platform.OS === 'ios' ? 80 : 60}
        tint={surface.blurTint}
        style={StyleSheet.absoluteFill}
      />
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: surface.tabBarOverlay },
        ]}
      />
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: StyleSheet.hairlineWidth,
          backgroundColor: surface.tabBarTopLine,
        }}
      />
    </View>
  );
}

function GlassHeaderBackground({ surface }: { surface: ThemeSurface }) {
  return (
    <View style={StyleSheet.absoluteFill}>
      <BlurView
        intensity={Platform.OS === 'ios' ? 70 : 50}
        tint={surface.blurTint}
        style={StyleSheet.absoluteFill}
      />
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: surface.headerOverlay },
        ]}
      />
    </View>
  );
}

function MainTabs() {
  const { colors, surface } = useTheme();
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          letterSpacing: 0.2,
        },
        tabBarStyle: [
          {
            position: 'absolute',
            backgroundColor: 'transparent',
            borderTopWidth: 0,
            height: Platform.OS === 'ios' ? 86 : 72,
            paddingTop: 8,
          },
          shadow.tabBar,
        ],
        tabBarBackground: () => <GlassTabBarBackground surface={surface} />,
        headerShown: false,
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tab.Screen
        name="ClosetTab"
        component={ClosetScreen}
        options={{
          tabBarLabel: 'Closet',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'shirt' : 'shirt-outline'}
              color={color}
              size={size}
            />
          ),
        }}
      />
      <Tab.Screen
        name="FeedTab"
        component={FeedScreen}
        options={{
          tabBarLabel: 'Feed',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'people' : 'people-outline'}
              color={color}
              size={size}
            />
          ),
        }}
      />
      <Tab.Screen
        name="UploadTab"
        component={UploadScreen}
        options={{
          tabBarLabel: 'Add',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'add-circle' : 'add-circle-outline'}
              color={color}
              size={size + 4}
            />
          ),
        }}
      />
      <Tab.Screen
        name="OutfitsTab"
        component={OutfitsScreen}
        options={{
          tabBarLabel: 'Outfits',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'sparkles' : 'sparkles-outline'}
              color={color}
              size={size}
            />
          ),
        }}
      />
      <Tab.Screen
        name="ProfileTab"
        component={ProfileScreen}
        options={{
          tabBarLabel: 'Profile',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'person-circle' : 'person-circle-outline'}
              color={color}
              size={size + 2}
            />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

function AppStackNavigator() {
  const { colors, surface } = useTheme();
  return (
    <AppStack.Navigator
      screenOptions={{
        headerTransparent: true,
        headerBackground: () => <GlassHeaderBackground surface={surface} />,
        headerTitleStyle: { ...typography.headline, color: colors.text },
        headerTintColor: colors.accent,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <AppStack.Screen
        name="MainTabs"
        component={MainTabs}
        options={{ headerShown: false }}
      />
      <AppStack.Screen
        name="ItemDetail"
        component={ItemDetailScreen}
        options={{ title: 'Item', headerBackTitle: 'Back' }}
      />
      <AppStack.Screen
        name="Wishlist"
        component={WishlistScreen}
        options={{ title: 'Wishlist', headerBackTitle: 'Back' }}
      />
      <AppStack.Screen
        name="Stats"
        component={StatsScreen}
        options={{ title: 'Stats', headerBackTitle: 'Back' }}
      />
      <AppStack.Screen
        name="Friends"
        component={FriendsScreen}
        options={{ title: 'Friends', headerBackTitle: 'Back' }}
      />
      <AppStack.Screen
        name="CreateFit"
        component={CreateFitScreen}
        options={{ title: 'New fit', headerBackTitle: 'Back' }}
      />
      <AppStack.Screen
        name="FitDetail"
        component={FitDetailScreen}
        options={{ title: 'Fit', headerBackTitle: 'Back' }}
      />
      <AppStack.Screen
        name="PublicProfile"
        component={PublicProfileScreen}
        options={{ title: 'Profile', headerBackTitle: 'Back' }}
      />
    </AppStack.Navigator>
  );
}

function AuthNavigator() {
  const { colors, surface } = useTheme();
  return (
    <AuthStack.Navigator
      screenOptions={{
        headerTransparent: true,
        headerBackground: () => <GlassHeaderBackground surface={surface} />,
        headerTitleStyle: { ...typography.headline, color: colors.text },
        headerTintColor: colors.accent,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <AuthStack.Screen
        name="Login"
        component={LoginScreen}
        options={{ headerShown: false }}
      />
      <AuthStack.Screen
        name="Register"
        component={RegisterScreen}
        options={{ title: 'Create account', headerBackTitle: 'Back' }}
      />
    </AuthStack.Navigator>
  );
}

function buildNavTheme(mode: 'light' | 'dark', colors: ThemeColors) {
  const base = mode === 'dark' ? DarkTheme : DefaultTheme;
  return {
    ...base,
    colors: {
      ...base.colors,
      background: colors.bg,
      card: colors.bg,
      text: colors.text,
      primary: colors.accent,
      border: 'transparent',
    },
  };
}

export function RootNavigator() {
  const { user, loading } = useAuth();
  const { mode, colors } = useTheme();

  const navTheme = useMemo(() => buildNavTheme(mode, colors), [mode, colors]);

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <NavigationContainer theme={navTheme}>
      {user ? <AppStackNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
