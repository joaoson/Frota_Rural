import { expect, it } from "vitest";
import { documentUrl } from "../api/documentUrl";
it("opens uploaded documents on the API origin, not the frontend or /api route", () => {
  expect(documentUrl("/media/documents/license.pdf", "http://localhost:8001/api/")).toBe("http://localhost:8001/media/documents/license.pdf");
  expect(documentUrl("media/documents/license.pdf", "http://127.0.0.1:8002/api")).toBe("http://127.0.0.1:8002/media/documents/license.pdf");
});
it("preserves absolute storage URLs instead of prepending the API twice", () => {
  expect(documentUrl("https://storage.example.test/photo.png?token=abc", "https://api.example.test/api/")).toBe("https://storage.example.test/photo.png?token=abc");
  expect(documentUrl("javascript:alert(1)", "https://api.example.test/api/")).toBe("");
});
