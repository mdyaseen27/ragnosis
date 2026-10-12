import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthProvider, useAuth } from './src/auth/AuthContext';
import type { RootStackParamList } from './src/navigation';
import Login from './src/screens/Login';
import Reports from './src/screens/Reports';
import ReportDetail from './src/screens/ReportDetail';
import Chat from './src/screens/Chat';
import Appointments from './src/screens/Appointments';
import OnDevice from './src/screens/OnDevice';
import { colors } from './src/theme';

const Stack = createNativeStackNavigator<RootStackParamList>();

function RootNavigator() {
  const { user, restoring } = useAuth();

  if (restoring) {
    // Stored-token check (/auth/me with refresh) is still in flight.
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.bg,
        }}
      >
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700' },
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      {user ? (
        <>
          <Stack.Screen name="Reports" component={Reports} options={{ title: 'My reports' }} />
          <Stack.Screen name="ReportDetail" component={ReportDetail} options={{ title: 'Report' }} />
          <Stack.Screen name="Chat" component={Chat} options={{ title: 'Ask about reports' }} />
          <Stack.Screen name="Appointments" component={Appointments} options={{ title: 'Appointments' }} />
          <Stack.Screen name="OnDevice" component={OnDevice} options={{ title: 'On-device AI' }} />
        </>
      ) : (
        <Stack.Screen name="Login" component={Login} options={{ headerShown: false }} />
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <NavigationContainer>
        <RootNavigator />
      </NavigationContainer>
    </AuthProvider>
  );
}
