// API base URL for the RAGnosis backend.
//
// Override at start time with an environment variable:
//   EXPO_PUBLIC_API_BASE=http://192.168.1.10:8000/api npx expo start
// On a physical device "localhost" is the phone itself — use your dev
// machine's LAN IP there. In an emulator/simulator on the same machine,
// the default works.
export const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE ?? 'http://localhost:8000/api';
