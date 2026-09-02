import { useState } from "react";

import MaterialIcon from "@/components/MaterialIcon";

import { BRANDS, type BrandKey, brandByKey } from "../types/brands";

function BrandLogo({ logo, label }: { logo: string; label: string }) {
  const [hasError, setHasError] = useState(false);

  if (!logo || hasError) {
    return (
      <span className="w-5 h-5 rounded-full bg-surface-container-high flex items-center justify-center text-[10px] font-bold">
        {label.charAt(0).toUpperCase()}
      </span>
    );
  }

  return (
    <img
      src={logo}
      alt={label}
      className="w-5 h-5 rounded-full object-cover"
      onError={() => setHasError(true)}
    />
  );
}

interface BrandSelectProps {
  value: BrandKey;
  onChange: (value: BrandKey) => void;
  hasError?: boolean;
}

export function BrandSelect({ value, onChange, hasError = false }: BrandSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const selected = brandByKey(value);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((previous) => !previous)}
        className={`w-full bg-surface-container border rounded-lg px-4 py-3.5 text-sm text-on-surface transition-shadow focus:ring-2 focus:outline-none flex items-center justify-between gap-2 ${
          hasError ? "border-error focus:ring-error" : "border-transparent focus:ring-primary"
        }`}
      >
        <span className="flex items-center gap-2">
          <BrandLogo logo={selected.logo} label={selected.label} />
          {selected.label}
        </span>
        <MaterialIcon icon={isOpen ? "expand_less" : "expand_more"} size={18} />
      </button>

      {isOpen ? (
        <div className="absolute z-10 mt-2 w-full bg-surface-container-lowest border border-outline-variant/40 rounded-lg shadow-lg p-1">
          {BRANDS.map((brand) => (
            <button
              key={brand.value}
              type="button"
              onClick={() => {
                onChange(brand.value);
                setIsOpen(false);
              }}
              className="w-full px-3 py-2 text-left rounded-md hover:bg-surface-container transition-colors text-sm text-on-surface flex items-center gap-2"
            >
              <BrandLogo logo={brand.logo} label={brand.label} />
              {brand.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
