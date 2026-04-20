export const AppConstants = {
  STORAGE_KEY: "frota_rural_tokens",
} as const;
export type UserRole = (typeof AppConstants)[keyof typeof AppConstants];
