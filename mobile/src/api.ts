/** API client — ITC backend Railway. */
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';

export const API_BASE =
  (Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined)?.apiBaseUrl ||
  'https://imo-backend-production-d2d1.up.railway.app/api/v1';

const TOKEN_KEY = 'itc_access_token';
const REFRESH_KEY = 'itc_refresh_token';

export type ApiEnvelope<T> = {
  success?: boolean;
  data?: T;
  message?: string;
};

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

export type PendingAction = {
  id: string;
  type: string;
  title: string;
  summary: string;
};

export type ChatResponse = {
  reply: string;
  suggestions?: string[];
  pendingAction?: PendingAction;
  documentUrl?: string;
  poweredBy?: string;
};

async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function setTokens(access: string, refresh?: string) {
  await SecureStore.setItemAsync(TOKEN_KEY, access);
  if (refresh) await SecureStore.setItemAsync(REFRESH_KEY, refresh);
}

export async function clearTokens() {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(REFRESH_KEY);
}

export async function isLoggedIn(): Promise<boolean> {
  return !!(await getToken());
}

async function api<T>(
  path: string,
  opts: RequestInit & { auth?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(opts.headers as Record<string, string>),
  };
  if (!(opts.body instanceof FormData)) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  }
  if (opts.auth !== false) {
    const token = await getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
  const json = (await res.json().catch(() => ({}))) as ApiEnvelope<T> & {
    error?: string;
    message?: string;
  };
  if (!res.ok) {
    throw new Error(json.message || json.error || `Erreur HTTP ${res.status}`);
  }
  return (json.data ?? json) as T;
}

export async function login(identifier: string, password: string) {
  const data = await api<{
    accessToken?: string;
    refreshToken?: string;
    mfaRequired?: boolean;
    user?: { firstName?: string; lastName?: string };
  }>('/auth/login', {
    method: 'POST',
    auth: false,
    body: JSON.stringify({ identifier, password }),
  });
  if (data.mfaRequired && !data.accessToken) {
    throw new Error('MFA requis — saisissez le code dans une prochaine version.');
  }
  if (!data.accessToken) throw new Error('Connexion refusée');
  await setTokens(data.accessToken, data.refreshToken);
  return data;
}

export async function chat(message: string, history: ChatMessage[]): Promise<ChatResponse> {
  return api<ChatResponse>('/ai/chat', {
    method: 'POST',
    body: JSON.stringify({ message, history: history.slice(-12) }),
  });
}

export async function confirmAction(actionId: string): Promise<ChatResponse> {
  return api<ChatResponse>('/ai/actions/confirm', {
    method: 'POST',
    body: JSON.stringify({ actionId }),
  });
}

export async function cancelAction(actionId: string): Promise<ChatResponse> {
  return api<ChatResponse>('/ai/actions/cancel', {
    method: 'POST',
    body: JSON.stringify({ actionId }),
  });
}

export async function chatFromImage(
  uri: string,
  mimeType: string,
  fileName: string,
  prompt?: string,
): Promise<ChatResponse> {
  const token = await getToken();
  const form = new FormData();
  form.append('file', {
    uri,
    name: fileName,
    type: mimeType,
  } as unknown as Blob);
  if (prompt) form.append('prompt', prompt);

  const res = await fetch(`${API_BASE}/ai/vision`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: form,
  });
  const json = (await res.json().catch(() => ({}))) as ApiEnvelope<ChatResponse> & {
    message?: string;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(json.message || json.error || `Erreur HTTP ${res.status}`);
  }
  return (json.data ?? json) as ChatResponse;
}
