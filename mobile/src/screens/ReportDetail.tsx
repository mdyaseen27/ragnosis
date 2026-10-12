import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api, ApiError } from '../api/client';
import type { CriticalFlag, ReportDetailData } from '../api/client';
import type { RootStackParamList } from '../navigation';
import { colors, common } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'ReportDetail'>;

function statusColor(status: string): string {
  switch ((status || '').toLowerCase()) {
    case 'normal':
      return colors.ok;
    case 'low':
      return colors.warn;
    case 'high':
    case 'critical':
      return colors.danger;
    default:
      return colors.muted;
  }
}

function flagText(f: CriticalFlag): string {
  if (typeof f === 'string') return f;
  if (f.message) return f.message;
  if (f.detail) return f.detail;
  const val = f.value !== undefined ? ` ${f.value}${f.unit ? ' ' + f.unit : ''}` : '';
  return f.param ? `${f.param}${val} is outside the safe range` : 'A value needs attention';
}

function confidencePct(c: number): number {
  return c <= 1 ? Math.round(c * 100) : Math.round(c);
}

export default function ReportDetail({ route, navigation }: Props) {
  const { reportId } = route.params;
  const [report, setReport] = useState<ReportDetailData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const d = await api<{ report: ReportDetailData }>(`/reports/${reportId}`);
        setReport(d.report);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'Could not load this report.');
      }
    })();
  }, [reportId]);

  if (error) {
    return (
      <View style={common.screen}>
        <Text style={common.errorText}>{error}</Text>
      </View>
    );
  }
  if (!report) {
    return (
      <View style={common.screen}>
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
      </View>
    );
  }

  const v = report.validation;
  const reviewed = v && (v.status === 'confirmed' || v.status === 'corrected');
  const reviewer = v?.by_name
    ? v.by_name.startsWith('Dr')
      ? v.by_name
      : `Dr. ${v.by_name}`
    : 'a clinician';

  return (
    <ScrollView style={common.screen}>
      <Text style={{ fontSize: 17, fontWeight: '700', color: colors.ink }}>{report.file_name}</Text>
      <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
        {new Date(report.created_at).toLocaleDateString()} · {report.category}
        {report.extraction_method ? ` · via ${report.extraction_method}` : ''}
      </Text>

      {!!report.labels?.length && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 }}>
          {report.labels.map((l) => (
            <View key={l.category} style={common.chip}>
              <Text style={common.chipText}>
                {l.category} · {confidencePct(l.confidence)}%
              </Text>
            </View>
          ))}
        </View>
      )}

      {reviewed && v && (
        <View
          style={{
            backgroundColor: colors.okBg,
            borderColor: colors.ok,
            borderWidth: 1,
            borderRadius: 10,
            padding: 12,
            marginTop: 12,
          }}
        >
          <Text style={{ color: colors.ok, fontWeight: '700', fontSize: 14 }}>
            ✓ Reviewed by {reviewer}
            {v.status === 'corrected' ? ' · values corrected after review' : ''}
          </Text>
          {!!v.at && (
            <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>
              {new Date(v.at).toLocaleString()}
            </Text>
          )}
        </View>
      )}

      <View style={[common.card, { marginTop: 12, alignItems: 'center' }]}>
        <Text style={{ fontSize: 13, color: colors.muted }}>Health score</Text>
        <Text style={{ fontSize: 44, fontWeight: '800', color: colors.ink }}>
          {report.health_score}
          <Text style={{ fontSize: 18, color: colors.muted }}>/100</Text>
        </Text>
        {!!report.health_band && (
          <Text style={{ fontSize: 13, fontWeight: '600', color: colors.primaryDark }}>
            {report.health_band}
          </Text>
        )}
        <Text style={{ fontSize: 12, color: colors.muted, marginTop: 6, textAlign: 'center' }}>
          Share of values inside their reference range. The formula is fully disclosed — no
          black box.
        </Text>
      </View>

      {!!report.critical_flags?.length && (
        <View
          style={{
            backgroundColor: colors.dangerBg,
            borderColor: colors.danger,
            borderWidth: 1,
            borderRadius: 14,
            padding: 16,
            marginBottom: 12,
          }}
        >
          <Text style={{ color: colors.danger, fontWeight: '700', fontSize: 15, marginBottom: 6 }}>
            Needs attention
          </Text>
          {report.critical_flags.map((f, i) => (
            <Text key={i} style={{ color: colors.ink, fontSize: 14, lineHeight: 20 }}>
              • {flagText(f)}
            </Text>
          ))}
          <Text style={{ color: colors.muted, fontSize: 12, marginTop: 6 }}>
            Please discuss these with your doctor promptly.
          </Text>
        </View>
      )}

      {!!report.summary && (
        <View style={common.card}>
          <Text style={common.heading}>Plain-language summary</Text>
          <Text style={{ fontSize: 14, color: colors.ink, lineHeight: 21 }}>{report.summary}</Text>
        </View>
      )}

      <View style={common.card}>
        <Text style={common.heading}>Measured values ({report.metrics.length})</Text>
        {report.metrics.map((m) => (
          <View
            key={m.param}
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingVertical: 9,
              borderTopWidth: 1,
              borderTopColor: colors.border,
            }}
          >
            <Text style={{ fontSize: 14, color: colors.ink, flex: 1 }}>{m.param}</Text>
            <Text style={{ fontSize: 14, fontWeight: '700', color: colors.ink, marginRight: 10 }}>
              {m.value} {m.unit}
            </Text>
            <Text style={{ fontSize: 13, fontWeight: '700', color: statusColor(m.status) }}>
              {m.status}
            </Text>
          </View>
        ))}
      </View>

      <TouchableOpacity
        style={[common.button, { marginBottom: 28 }]}
        onPress={() => navigation.navigate('Chat', { reportId: report.id })}
      >
        <Text style={common.buttonText}>Ask about this report</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
