export type ReviewDocumentRequest = {
  validation_status: "approved" | "rejected";
  review_note?: string | null;
};
