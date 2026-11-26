import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SettingsProvider, useSettings } from './src/state/settings';
import { SessionProvider, useSession } from './src/state/session';
import { Onboarding } from './src/screens/Onboarding';
import { MapScreen } from './src/screens/MapScreen';

function Root() {
  const settings = useSettings();
  const session = useSession();
  const [onboarding, setOnboarding] = useState<boolean | null>(null);

  // Decide once both stores have loaded; go back to onboarding after sign-out.
  useEffect(() => {
    if (!settings.ready || !session.ready) return;
    if (onboarding === null) setOnboarding(!session.token || !settings.lang);
    else if (!session.token) setOnboarding(true);
  }, [settings.ready, session.ready, session.token, settings.lang, onboarding]);

  if (onboarding === null) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: settings.c.bg }}>
        <ActivityIndicator color={settings.c.primary} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style={settings.scheme === 'dark' ? 'light' : 'dark'} />
      {onboarding ? <Onboarding onDone={() => setOnboarding(false)} /> : <MapScreen />}
    </>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <SettingsProvider>
        <SessionProvider>
          <Root />
        </SessionProvider>
      </SettingsProvider>
    </SafeAreaProvider>
  );
}
