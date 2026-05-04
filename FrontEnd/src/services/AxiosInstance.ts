import axios from "axios";

export const AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api/",
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

// Propriedades privadas (permitem conexão com AuthContext)
let _accessToken: string | null = null;
let _logoutCallback: (() => void) | null = null;

export function setAccessToken(token: string | null): void {
  _accessToken = token;
}

export function setLogoutCallback(fn: () => void): void {
  _logoutCallback = fn;
}

// Interceptors
AxiosInstance.interceptors.request.use((config) => {
  if (_accessToken) {
    config.headers.Authorization = `Bearer ${_accessToken}`;
  }
  return config;
});

AxiosInstance.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    const is401 = error.response?.status === 401;
    const isRefreshCall = original?.url === "login/refresh";
    const alreadyRetried = original?._retry === true;

    // Tenta fazer refresh do token por interceptor caso falhe após uma tentativa
    if (is401 && !isRefreshCall && !alreadyRetried) {
      original._retry = true;
      try {
        const { data } = await AxiosInstance.post<{ access: string }>(
          "login/refresh",
        );
        setAccessToken(data.access);
        original.headers.Authorization = `Bearer ${data.access}`;
        return AxiosInstance(original);
      } catch {
        setAccessToken(null);
        _logoutCallback?.();
      }
    }

    return Promise.reject(error);
  },
);
