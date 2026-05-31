export type CreateCertificationRequest = {
  user: string;
  issuing_organization: string;
  title: string;
  issue_date: string;
  credential_code?: string;
  description: string;
  media_url?: string;
};
