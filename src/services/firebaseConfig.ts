import type { FirebaseOptions } from 'firebase/app';

const raw = import.meta.env.VITE_FIREBASE_CONFIG;

function readConfig(): FirebaseOptions | undefined {
  if (!raw) return;
  try {
    const config = JSON.parse(raw) as FirebaseOptions;
    if ([config?.apiKey, config?.authDomain, config?.projectId, config?.appId].every(value => typeof value === 'string' && value.trim())) return config;
  } catch { /* The planner reports invalid configuration. */ }
}

export const firebaseConfig = readConfig();
export const firebaseConfigProvided = Boolean(raw);
