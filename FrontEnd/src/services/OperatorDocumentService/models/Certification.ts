export type Certification = {
  id: string;
  user: string;
  issuing_organization: string;
  title: string;
  issue_date: string;
  expiration_date?: string | null;
  credential_code?: string | null;
  description: string;
  media_url?: string | null;
  validation_status: string;
  created_at?: string | null;
  updated_at?: string | null;
};
