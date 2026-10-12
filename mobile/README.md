# RAGnosis Mobile (patient app)

The Expo / React Native patient app for RAGnosis — the companion to the web
app. Same backend, same accounts: sign in with the email or mobile number and
password you use on the web.

**What it does**

- **My reports** — your analysed reports with health score, category and
  multi-label chips (label + confidence).
- **Report detail** — health score, plain-language summary, critical flags,
  the full values table, and a **“Reviewed by Dr. …”** badge when a clinician
  has confirmed or corrected the report (`validation` in the API response).
- **Chat** — ask about a report in plain language, with one-tap question
  chips. Answers come from the same report-grounded answerer as the web.
- **Appointments** — pick a doctor and a day, choose a free slot, book, and
  cancel your own upcoming appointments.
- **On-device AI** — explains and probes the quantized on-device embedding
  model (see the contract below).

## Run it

```bash
cd mobile
npm install
npx expo start
```

Then scan the QR code with Expo Go, or press `a` / `i` for an
emulator/simulator.

> **Demo account** (after `python -m app.db.seed` on the backend):
> `demo.patient@ragnosis.example` / `demo1234`

### Type-check

```bash
npx tsc --noEmit
```

## API configuration

The app talks to the RAGnosis Flask API. The base URL defaults to
`http://localhost:8000/api` (see `src/config.ts`) and can be overridden with
an environment variable:

```bash
EXPO_PUBLIC_API_BASE=http://192.168.1.10:8000/api npx expo start
```

On a **physical device**, `localhost` is the phone itself — always set
`EXPO_PUBLIC_API_BASE` to your dev machine's LAN IP (backend running on port
8000, started the same way as for the web app). In an Android emulator,
`10.0.2.2` usually reaches the host machine.

Auth mirrors the web client exactly: tokens live in `expo-secure-store`,
every request carries the access token, and a 401 triggers a single shared
refresh-and-retry; if the refresh is dead the app returns to the sign-in
screen. No credentials or tokens are stored anywhere else.

## On-device model contract

The On-device AI screen is backed by `src/services/ondevice.ts` and an
optional metadata file, `assets/model.json`:

| Field          | Meaning                                                        |
| -------------- | -------------------------------------------------------------- |
| `name`         | Model id (`all-MiniLM-L6-v2` — same embedder as the server).   |
| `task`         | `sentence-embeddings`.                                         |
| `quantization` | `int8-dynamic` — the quantized build used on device.           |
| `embeddingDim` | 384.                                                           |
| `sizeMb`       | Approximate bundled size.                                      |
| `modelFile`    | File name of the bundled `.onnx` binary, or `null`.            |
| `notes`        | Free-text notes shown in the app.                              |

Behaviour:

- `modelFile` is `null` (the shipped default) or the runtime fails to load
  for any reason → the service reports **server mode** with a plain-language
  reason. **It never throws and never crashes the screen.**
- To enable device inference: drop the quantized `.onnx` file into
  `assets/`, set `modelFile` to its name, and ship an **Expo dev build**
  (`npx expo run:android` / `run:ios` or EAS Build). ONNX Runtime
  (`onnxruntime-react-native`) is a native module, so it is **not available
  in Expo Go** — there the app simply runs in server mode, with the same
  answers from the API.

## Structure

```
App.tsx                 Root navigator + auth gate (restoring → login → app)
src/
  config.ts             API base URL (EXPO_PUBLIC_API_BASE override)
  theme.ts              Brand tokens shared with the web app
  navigation.ts         Route param types
  api/client.ts         fetch client: SecureStore tokens, single-flight refresh
  auth/AuthContext.tsx  Session state (restore, login, logout)
  screens/              Login, Reports, ReportDetail, Chat, Appointments, OnDevice
  services/ondevice.ts  Quantized-model probe with server-mode fallback
assets/model.json       Optional on-device model metadata (see contract above)
```
