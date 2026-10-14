"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { getExchangeRates, formatCurrency } from "@/lib/currency";

type LocalizationSettings = {
  currency: string;
  locale: string;
  country: string;
};

interface LocalizationContextType extends LocalizationSettings {
  setCurrency: (currency: string) => void;
  setLocale: (locale: string) => void;
  formatPrice: (amountKobo: number | null | undefined, baseCurrency?: string) => Promise<string>;
}

const LocalizationContext = createContext<LocalizationContextType | undefined>(undefined);

export function LocalizationProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<LocalizationSettings>({
    currency: "NGN",
    locale: "en-NG",
    country: "NG",
  });

  useEffect(() => {
    async function initLocalization() {
      const saved = localStorage.getItem("glypha_loc_settings");
      if (saved) {
        setSettings(JSON.parse(saved));
        return;
      }

      try {
        // Detect location via free API
        const res = await fetch("https://ipapi.co/json/");
        const data = await res.json();
        
        if (data.country && data.currency) {
          const newSettings = {
            currency: data.currency,
            locale: data.languages?.[0] || "en-US",
            country: data.country,
          };
          setSettings(newSettings);
          localStorage.setItem("glypha_loc_settings", JSON.stringify(newSettings));
        }
      } catch (e) {
        console.error("Localization detection failed", e);
      }
    }
    initLocalization();
  }, []);

  const setCurrency = (currency: string) => {
    setSettings(prev => {
      const next = { ...prev, currency };
      localStorage.setItem("glypha_loc_settings", JSON.stringify(next));
      return next;
    });
  };

  const setLocale = (locale: string) => {
    setSettings(prev => {
      const next = { ...prev, locale };
      localStorage.setItem("glypha_loc_settings", JSON.stringify(next));
      return next;
    });
  };

  const formatPrice = async (amountKobo: number | null | undefined, baseCurrency: string = "NGN") => {
    if (!amountKobo || amountKobo <= 0) return "Free";

    try {
      // 1. Get exchange rate from baseCurrency to current settings.currency
      const rates = await getExchangeRates(baseCurrency);
      const rate = rates[settings.currency] || 1;
      
      // 2. Convert kobo (base) to target currency
      // Amount is in base currency cents/kobo. 
      // Base amount in units = amountKobo / 100
      const baseUnits = amountKobo / 100;
      const targetUnits = baseUnits * rate;

      return formatCurrency(targetUnits, settings.currency, settings.locale);
    } catch (e) {
      // Fallback to base currency formatting
      return formatCurrency(amountKobo / 100, baseCurrency, settings.locale);
    }
  };

  return (
    <LocalizationContext.Provider 
      value={{ ...settings, setCurrency, setLocale, formatPrice }}
    >
      {children}
    </LocalizationContext.Provider>
  );
}

export function useLocalization() {
  const context = useContext(LocalizationContext);
  if (!context) throw new Error("useLocalization must be used within LocalizationProvider");
  return context;
}
