import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach } from "vitest";

// Vitest roda sem `globals`, então o auto-cleanup da Testing Library não é registrado.
afterEach(cleanup);

// A instrumentação de cobertura deixa a suíte mais lenta no CI; 1 s padrão gera falsos negativos.
configure({ asyncUtilTimeout: 3000 });

// APIs de layout que o jsdom não implementa; componentes de tema e Radix as consultam.
if (!window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false, media: query, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
    }),
  });
}
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
}
// Radix Select/Popover usam captura de ponteiro e rolagem até o item.
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.releasePointerCapture ??= () => {};
Element.prototype.scrollIntoView ??= () => {};
window.scrollTo = () => {};
// framer-motion usa IntersectionObserver para animações `whileInView`.
if (!globalThis.IntersectionObserver) {
  globalThis.IntersectionObserver = class {
    root = null; rootMargin = ""; thresholds = [];
    observe() {} unobserve() {} disconnect() {} takeRecords() { return []; }
  } as unknown as typeof IntersectionObserver;
}
