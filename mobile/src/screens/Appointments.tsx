import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { api, ApiError } from '../api/client';
import type { Appointment, Doctor, Slot } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { colors, common } from '../theme';

function dayOptions(count: number): Array<{ value: string; label: string }> {
  const out: Array<{ value: string; label: string }> = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate(),
    ).padStart(2, '0')}`;
    out.push({
      value,
      label:
        i === 0
          ? 'Today'
          : d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }),
    });
  }
  return out;
}

const DAYS = dayOptions(7);

export default function Appointments() {
  const { user } = useAuth();
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [doctorId, setDoctorId] = useState('');
  const [date, setDate] = useState(DAYS[0].value);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [slot, setSlot] = useState('');
  const [notes, setNotes] = useState('');
  const [mine, setMine] = useState<Appointment[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadMine = useCallback(async () => {
    try {
      const d = await api<{ appointments: Appointment[] }>('/hospital/appointments');
      setMine(d.appointments);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load your appointments.');
    }
  }, []);

  useEffect(() => {
    // Demo-directory doctors have no bookable schedule (their slots 404) —
    // only real doctor accounts belong in the picker.
    api<{ doctors: Doctor[] }>('/hospital/doctors')
      .then((d) => setDoctors(d.doctors.filter((x) => !x.is_demo)))
      .catch((e) =>
        setError(e instanceof ApiError ? e.message : 'Could not load doctors.'),
      );
    loadMine();
  }, [loadMine]);

  useEffect(() => {
    if (!doctorId || !date) {
      setSlots(null);
      return;
    }
    setSlot('');
    api<{ slots: Slot[] }>(`/hospital/doctors/${doctorId}/slots?date=${date}`)
      .then((d) => setSlots(d.slots))
      .catch((e) => {
        setError(e instanceof ApiError ? e.message : 'Could not load slots.');
        setSlots(null);
      });
  }, [doctorId, date]);

  const book = async () => {
    if (!user || !doctorId || !slot) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api('/hospital/appointments', {
        method: 'POST',
        body: {
          doctor_id: doctorId,
          patient_id: user.id,
          date,
          slot,
          notes: notes.trim() || undefined,
        },
      });
      setNotice('Appointment booked.');
      setSlot('');
      setNotes('');
      loadMine();
      const d = await api<{ slots: Slot[] }>(`/hospital/doctors/${doctorId}/slots?date=${date}`);
      setSlots(d.slots);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Booking failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const cancel = (a: Appointment) => {
    Alert.alert(
      'Cancel appointment',
      `Cancel your appointment on ${a.date} at ${a.slot}?`,
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Cancel appointment',
          style: 'destructive',
          onPress: async () => {
            try {
              await api(`/hospital/appointments/${a.id}`, {
                method: 'PATCH',
                body: { status: 'cancelled' },
              });
              setNotice('Appointment cancelled.');
              loadMine();
            } catch (e) {
              setError(e instanceof ApiError ? e.message : 'Could not cancel.');
            }
          },
        },
      ],
    );
  };

  const upcoming = mine.filter((a) => a.status === 'scheduled');
  const past = mine.filter((a) => a.status !== 'scheduled');

  return (
    <ScrollView style={common.screen}>
      <Text style={common.title}>Appointments</Text>
      <Text style={common.sub}>Book a visit and manage your upcoming appointments.</Text>

      {!!error && <Text style={common.errorText}>{error}</Text>}
      {!!notice && <Text style={common.noticeText}>{notice}</Text>}

      <View style={[common.card, { marginTop: 12 }]}>
        <Text style={common.heading}>Book an appointment</Text>

        <Text style={common.label}>Doctor</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {doctors.map((d) => {
            const selected = doctorId === d.id;
            return (
              <TouchableOpacity
                key={d.id}
                style={[
                  common.chip,
                  selected && { backgroundColor: colors.primary, borderColor: colors.primary },
                ]}
                onPress={() => setDoctorId(d.id)}
              >
                <Text style={[common.chipText, selected && { color: '#fff' }]}>
                  {d.name}
                  {d.specialization ? ` · ${d.specialization}` : ''}
                </Text>
              </TouchableOpacity>
            );
          })}
          {doctors.length === 0 && (
            <Text style={{ color: colors.muted, fontSize: 13 }}>Loading doctors…</Text>
          )}
        </View>

        <Text style={common.label}>Date</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {DAYS.map((d) => {
            const selected = date === d.value;
            return (
              <TouchableOpacity
                key={d.value}
                style={[
                  common.chip,
                  selected && { backgroundColor: colors.primary, borderColor: colors.primary },
                ]}
                onPress={() => setDate(d.value)}
              >
                <Text style={[common.chipText, selected && { color: '#fff' }]}>{d.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <Text style={common.label}>Note (optional)</Text>
        <TextInput
          style={common.input}
          value={notes}
          onChangeText={setNotes}
          placeholder='e.g. "follow-up for my CBC report"'
          placeholderTextColor={colors.muted}
        />

        <Text style={common.label}>Slot</Text>
        {slots === null ? (
          <Text style={{ color: colors.muted, fontSize: 13 }}>
            Pick a doctor and date to see free slots.
          </Text>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {slots.map((s) => {
              const selected = slot === s.time;
              return (
                <TouchableOpacity
                  key={s.time}
                  disabled={!s.available}
                  onPress={() => setSlot(s.time)}
                  style={{
                    borderWidth: 1,
                    borderColor: selected ? colors.primary : colors.border,
                    backgroundColor: selected
                      ? colors.primary
                      : s.available
                        ? '#fff'
                        : colors.chipBg,
                    borderRadius: 8,
                    paddingHorizontal: 10,
                    paddingVertical: 7,
                    marginRight: 6,
                    marginBottom: 6,
                    opacity: s.available ? 1 : 0.45,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: '600',
                      color: selected ? '#fff' : colors.ink,
                    }}
                  >
                    {s.time}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <TouchableOpacity
          style={[common.button, (busy || !slot || !doctorId) && common.buttonDisabled]}
          onPress={book}
          disabled={busy || !slot || !doctorId}
        >
          <Text style={common.buttonText}>{busy ? 'Booking…' : 'Book appointment'}</Text>
        </TouchableOpacity>
      </View>

      <View style={common.card}>
        <Text style={common.heading}>Upcoming</Text>
        {upcoming.length === 0 ? (
          <Text style={{ color: colors.muted, fontSize: 13 }}>
            No upcoming appointments. Book one above.
          </Text>
        ) : (
          upcoming.map((a) => (
            <View
              key={a.id}
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingVertical: 9,
                borderTopWidth: 1,
                borderTopColor: colors.border,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.ink }}>
                  {a.doctor_name || 'Doctor'}
                </Text>
                <Text style={{ fontSize: 12, color: colors.muted }}>
                  {a.date} · {a.slot}
                  {a.notes ? ` · ${a.notes}` : ''}
                </Text>
              </View>
              <TouchableOpacity onPress={() => cancel(a)}>
                <Text style={{ color: colors.danger, fontWeight: '600', fontSize: 13 }}>
                  Cancel
                </Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>

      {past.length > 0 && (
        <View style={[common.card, { marginBottom: 28 }]}>
          <Text style={common.heading}>History</Text>
          {past.map((a) => (
            <View
              key={a.id}
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                paddingVertical: 9,
                borderTopWidth: 1,
                borderTopColor: colors.border,
              }}
            >
              <View>
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.ink }}>
                  {a.doctor_name || 'Doctor'}
                </Text>
                <Text style={{ fontSize: 12, color: colors.muted }}>
                  {a.date} · {a.slot}
                </Text>
              </View>
              <Text style={{ fontSize: 12, color: colors.muted, textTransform: 'capitalize' }}>
                {a.status.replace('_', ' ')}
              </Text>
            </View>
          ))}
        </View>
      )}
      {busy && <ActivityIndicator color={colors.primary} style={{ marginBottom: 20 }} />}
    </ScrollView>
  );
}
