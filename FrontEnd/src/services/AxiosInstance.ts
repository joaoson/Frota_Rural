import { AppConstants } from "@/contexts/Constants";
import axios from "axios";

export const AxiosInstance = axios.create({
  baseURL: import.meta.env.API_BASE_URL || "http://localhost:8000/api/",
  headers: {
    "Content-Type": "application/json",
  },
});

/// Places JWT token if its detected on LocalStorage
AxiosInstance.interceptors.request.use((config) => {
  try {
    const raw = localStorage.getItem(AppConstants.STORAGE_KEY);
    if (raw) {
      const { access } = JSON.parse(raw);
      config.headers.Authorization = `Bearer ${access}`;
    }
  } catch {}
  return config;
});
