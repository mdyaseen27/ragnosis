import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api, ApiError } from '../api/client';
import type { ReportListItem } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import type { RootStackParamList } from '../navigation';
import { colors, common } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Reports'>;

function scoreColor(score: number): string {
  if (score >= 85) return colors.ok;
  if (score >= 60) return colors.primary;
  if (score >= 40) return colors.warn;
  return colors.danger;
}

function confidencePct(c: number): number {
  // Confidence is stored 0..1; render defensively if a 0..100 slips in.
  return c <= 1 ? Math.round(c * 100) : Math.round(c);
}

export default function Reports({ navigation }: Props) {
  const { user, logout } = useAuth();
  const [reports, setReports] = useState<ReportListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const d = await api<{ reports: ReportListItem[] }>('/reports');
      setReports(d.reports);
      setError('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load your reports.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <View style={common.screen}>
      <Text style={common.title}>Namaste{user?.name ? `, ${user.name.split(' ')[0]}` : ''}</Text>
      <Text style={common.sub}>Every report is analysed by auditable rules — never guessed.</Text>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 12, marginBottom: 4 }}>
        <TouchableOpacity style={common.chip} onPress={() => navigation.navigate('Chat')}>
          <Text style={common.chipText}>Ask about reports</Text>
        </TouchableOpacity>
        <TouchableOpacity style={common.chip} onPress={() => navigation.navigate('Appointments')}>
          <Text style={common.chipText}>Appointments</Text>
        </TouchableOpacity>
        <TouchableOpacity style={common.chip} onPress={() => navigation.navigate('OnDevice')}>
          <Text style={common.chipText}>On-device AI</Text>
        </TouchableOpacity>
        <TouchableOpacity style={common.chip} onPress={logout}>
          <Text style={common.chipText}>Sign out</Text>
        </TouchableOpacity>
      </View>

      {!!error && <Text style={common.errorText}>{error}</Text>}

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={reports}
          keyExtractor={(r) => r.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={[common.card, { marginTop: 12 }]}>
              <Text style={common.heading}>No reports yet</Text>
              <Text style={common.sub}>
                Reports you upload on the web app will appear here with their values, health
                score and summary.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={common.card}
              onPress={() =>
                navigation.navigate('ReportDetail', {
                  reportId: item.id,
                  fileName: item.file_name,
                })
              }
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: colors.ink, flex: 1, marginRight: 10 }}>
                  {item.file_name}
                </Text>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 20, fontWeight: '800', color: scoreColor(item.health_score) }}>
                    {item.health_score}
                  </Text>
                  {!!item.health_band && (
                    <Text style={{ fontSize: 11, color: colors.muted }}>{item.health_band}</Text>
                  )}
                </View>
              </View>
              <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
                {new Date(item.created_at).toLocaleDateString()} · {item.category}
                {item.extraction_method ? ` · via ${item.extraction_method}` : ''}
              </Text>
              {!!item.labels?.length && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
                  {item.labels.slice(0, 3).map((l) => (
                    <View key={l.category} style={common.chip}>
                      <Text style={common.chipText}>
                        {l.category} · {confidencePct(l.confidence)}%
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}
