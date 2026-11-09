import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ContactsProvider } from './src/store/ContactsContext';
import { SmsInboxProvider } from './src/store/SmsInboxContext';
import { SettingsProvider } from './src/store/SettingsContext';
import { PremiumProvider } from './src/store/PremiumContext';
import HomeScreen from './src/screens/HomeScreen';
import CustomerDetailScreen from './src/screens/CustomerDetailScreen';
import CustomerFormScreen from './src/screens/CustomerFormScreen';
import SmsImportScreen from './src/screens/SmsImportScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import PremiumScreen from './src/screens/PremiumScreen';
import { colors } from './src/theme';

const Stack = createNativeStackNavigator();

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

// Provider order matters: SettingsProvider and PremiumProvider must sit ABOVE
// NavigationContainer so every screen (and its useSettings/usePremium calls)
// resolves them — that was the "useSettings must be used inside SettingsProvider"
// crash.
export default function App() {
  return (
    <SafeAreaProvider>
      <SettingsProvider>
        <PremiumProvider>
          <ContactsProvider>
            <SmsInboxProvider>
              <StatusBar style="light" />
              <NavigationContainer theme={navTheme}>
                <Stack.Navigator
                  screenOptions={{
                    headerShown: false,
                    animation: 'slide_from_left', // RTL: new screens slide in from the left
                    contentStyle: { backgroundColor: colors.bg },
                  }}
                >
                  <Stack.Screen name="Home" component={HomeScreen} />
                  <Stack.Screen name="CustomerDetail" component={CustomerDetailScreen} />
                  <Stack.Screen name="CustomerForm" component={CustomerFormScreen} />
                  <Stack.Screen name="SmsImport" component={SmsImportScreen} />
                  <Stack.Screen name="Settings" component={SettingsScreen} />
                  <Stack.Screen name="Premium" component={PremiumScreen} />
                </Stack.Navigator>
              </NavigationContainer>
            </SmsInboxProvider>
          </ContactsProvider>
        </PremiumProvider>
      </SettingsProvider>
    </SafeAreaProvider>
  );
}
