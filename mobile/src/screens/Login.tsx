import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../api/client';
import { colors, common } from '../theme';

export default function Login() {
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!identifier.trim() || !password) {
      setError('Enter your email or mobile number and password.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await login(identifier, password);
      // On success the root navigator swaps to the app stack.
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Sign-in failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[common.screen, { justifyContent: 'center' }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={{ alignItems: 'center', marginBottom: 28 }}>
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            backgroundColor: colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontSize: 28, fontWeight: '800' }}>R</Text>
        </View>
        <Text style={[common.title, { marginTop: 14 }]}>RAGnosis</Text>
        <Text style={common.sub}>Your lab reports, in plain language.</Text>
      </View>

      <View style={common.card}>
        <Text style={common.label}>Email or mobile number</Text>
        <TextInput
          style={common.input}
          value={identifier}
          onChangeText={setIdentifier}
          placeholder="you@example.com or 9876543210"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          autoComplete="username"
        />
        <Text style={common.label}>Password</Text>
        <TextInput
          style={common.input}
          value={password}
          onChangeText={setPassword}
          placeholder="Your password"
          placeholderTextColor={colors.muted}
          secureTextEntry
          autoComplete="password"
          onSubmitEditing={submit}
        />
        {!!error && <Text style={common.errorText}>{error}</Text>}
        <TouchableOpacity
          style={[common.button, busy && common.buttonDisabled]}
          onPress={submit}
          disabled={busy}
        >
          <Text style={common.buttonText}>{busy ? 'Signing in…' : 'Sign in'}</Text>
        </TouchableOpacity>
      </View>

      <Text style={[common.sub, { textAlign: 'center' }]}>
        Educational information only — RAGnosis does not diagnose.
      </Text>
    </KeyboardAvoidingView>
  );
}
