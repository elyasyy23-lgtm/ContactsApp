import React, { useEffect, useRef, useState } from 'react';
import { AppState, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LanguageProvider } from './src/i18n/LanguageContext';
import { ContactsProvider } from './src/store/ContactsContext';
import { ProfilesProvider } from './src/store/ProfilesContext';
import { SmsInboxProvider } from './src/store/SmsInboxContext';
import { SettingsProvider, useSettings } from './src/store/SettingsContext';
import { PremiumProvider, usePremium } from './src/store/PremiumContext';
import HomeScreen from './src/screens/HomeScreen';
import CustomerDetailScreen from './src/screens/CustomerDetailScreen';
import CustomerFormScreen from './src/screens/CustomerFormScreen';
import SmsImportScreen from './src/screens/SmsImportScreen';
import ProfilesScreen from './src/screens/ProfilesScreen';
import ProfileDetailScreen from './src/screens/ProfileDetailScreen';
import ProfileFormScreen from './src/screens/ProfileFormScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import PremiumScreen from './src/screens/PremiumScreen';
import DebtorsScreen from './src/screens/DebtorsScreen';
import ReportScreen from './src/screens/ReportScreen';
import CalculatorScreen from './src/screens/CalculatorScreen';
import LockScreen from './src/screens/LockScreen';
import AppDrawer from './src/components/AppDrawer';
import { colors } from './src/theme';

const Stack = createNativeStackNavigator();
const Drawer = createDrawerNavigator();

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.primary,
    background: colors.bg,
    card: colors.primary,
    text: colors.text,
    border: colors.border,
  },
};

const screenOptions = {
  headerShown: false,
  animation: 'slide_from_left', // RTL: new screens slide in from the left
  contentStyle: { backgroundColor: colors.bg },
};

/** All app screens; the drawer wraps this whole stack. */
function MainStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen name="CustomerDetail" component={CustomerDetailScreen} />
      <Stack.Screen name="CustomerForm" component={CustomerFormScreen} />
      <Stack.Screen name="SmsImport" component={SmsImportScreen} />
      <Stack.Screen name="Profiles" component={ProfilesScreen} />
      <Stack.Screen name="ProfileDetail" component={ProfileDetailScreen} />
      <Stack.Screen name="ProfileForm" component={ProfileFormScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="Premium" component={PremiumScreen} />
      <Stack.Screen name="Debtors" component={DebtorsScreen} />
      <Stack.Screen name="Report" component={ReportScreen} />
      <Stack.Screen name="Calculator" component={CalculatorScreen} />
    </Stack.Navigator>
  );
}

/** Drawer on the RIGHT side (RTL menu). Swipe is off so it never fights the
 *  Android back gesture — the hamburger on the home header opens it. */
function DrawerShell() {
  return (
    <Drawer.Navigator
      drawerContent={(props) => <AppDrawer {...props} />}
      screenOptions={{
        headerShown: false,
        drawerPosition: 'right',
        drawerType: 'front',
        swipeEnabled: false,
        drawerStyle: { width: 300, backgroundColor: colors.bg },
        overlayColor: colors.overlay,
      }}
    >
      <Drawer.Screen name="MainStack" component={MainStack} />
    </Drawer.Navigator>
  );
}

/**
 * The lock gate: with «قفل برنامه» on, every cold start AND every return from
 * background shows the fingerprint/PIN screen. The unlock state is in-memory
 * only — it resets when the app process dies or the user leaves the app.
 */
function LockGate({ children }) {
  const { settings, hydrated } = useSettings();
  const [unlocked, setUnlocked] = useState(false);
  const unlockRef = useRef(false);

  const handleUnlock = () => {
    unlockRef.current = true;
    setUnlocked(true);
  };

  // Re-lock when the app goes to the background (leaving = locking again).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'background' && !unlockRef.current) {
        setUnlocked(false);
      }
    });
    return () => sub.remove();
  }, []);

  if (!hydrated) {
    return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  }
  if (settings.appLock && !unlocked) {
    return <LockScreen onUnlocked={handleUnlock} />;
  }
  return children;
}

// The trial gate: once the 7 days are over and nothing was purchased, the whole
// app is replaced by the paywall — there is no other screen to navigate to.
function RootNavigator() {
  const { hydrated, locked } = usePremium();

  // Wait for AsyncStorage before deciding: rendering Home first and then
  // swapping it for the paywall would flicker for the user.
  if (!hydrated) {
    return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  }

  if (locked) {
    return (
      <NavigationContainer theme={navTheme}>
        <Stack.Navigator screenOptions={screenOptions}>
          <Stack.Screen name="Premium" component={PremiumScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    );
  }

  return (
    <NavigationContainer theme={navTheme}>
      <LockGate>
        <DrawerShell />
      </LockGate>
    </NavigationContainer>
  );
}

// Provider order matters: SettingsProvider and PremiumProvider must sit ABOVE
// NavigationContainer so every screen (and its useSettings/usePremium calls)
// resolves them — that was the "useSettings must be used inside SettingsProvider"
// crash. GestureHandlerRootView is required by the drawer's gesture plumbing.
export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <LanguageProvider>
          <SettingsProvider>
            <PremiumProvider>
              <ProfilesProvider>
                <ContactsProvider>
                  <SmsInboxProvider>
                    <StatusBar style="light" />
                    <RootNavigator />
                  </SmsInboxProvider>
                </ContactsProvider>
              </ProfilesProvider>
            </PremiumProvider>
          </SettingsProvider>
        </LanguageProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
