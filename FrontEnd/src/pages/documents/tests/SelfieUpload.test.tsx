import { screen } from "@testing-library/react";
import { useLocation } from "react-router";
import { expect, it, vi } from "vitest";
import SelfieUpload from "../SelfieUpload";
import { renderWithProviders } from "@/test/render";

const auth = vi.hoisted(() => ({ isLoading: false, isAuthenticated: true, userRole: "locador" as string | null }));
vi.mock("@/contexts/useAuth", () => ({ useAuth: () => auth }));

function Landing() {
  const { pathname, search } = useLocation();
  return <output>{pathname + search}</output>;
}
const open = () => renderWithProviders(<SelfieUpload />, { route: "/signup/profile-upload", routes: {
  "/login": <Landing />, "/dashboard": <Landing />, "/dashboard-locatario": <Landing />, "/admin": <Landing />,
} });

it.each([
  [{ isAuthenticated: false }, "/login"],
  [{ userRole: "locador" }, "/dashboard?tab=conta"],
  [{ userRole: "operador" }, "/dashboard-locatario?tab=conta"],
  [{ userRole: "admin" }, "/admin"],
])("sends the retired selfie bookmark to the account area (%j)", (state, landing) => {
  Object.assign(auth, { isLoading: false, isAuthenticated: true, userRole: "locador" }, state);
  open();
  expect(screen.getByRole("status")).toHaveTextContent(landing);
});

it("waits for the session to be restored before redirecting", () => {
  Object.assign(auth, { isLoading: true });
  const { container } = open();
  expect(container).toBeEmptyDOMElement();
});
