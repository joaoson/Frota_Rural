import axios from "axios";

export const AxiosInstance = axios.create({
    baseURL: import.meta.env.API_BASE_URL || "http://localhost:8000/api/",
    headers: {
        "Content-Type": "application/json",
    },
});