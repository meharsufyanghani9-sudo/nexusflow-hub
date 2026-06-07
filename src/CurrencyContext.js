import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';

// ─── Default (fallback) currency ─────────────────────────────────────────────
const DEFAULT_CURRENCY = {
  code:   'USD',
  symbol: '$',
  name:   'US Dollar',
  rate:   1,
};

const CurrencyContext = createContext({
  currency: DEFAULT_CURRENCY,
  currencies: [DEFAULT_CURRENCY],
  setCurrency: () => {},
  format: (amount) => '$' + Number(amount).toFixed(2),
  loading: false,
});

export function CurrencyProvider({ children }) {
  const [currencies,       setCurrencies]       = useState([DEFAULT_CURRENCY]);
  const [selectedCurrency, setSelectedCurrency] = useState(DEFAULT_CURRENCY);
  const [loading,          setLoading]          = useState(true);

  // Load all active currencies from DB
  const loadCurrencies = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('currencies')
      .select('*')
      .eq('is_active', true)
      .order('code');

    if (!error && data && data.length > 0) {
      setCurrencies(data);
      // Restore previously selected currency from localStorage
      try {
        const saved = localStorage.getItem('nf_currency');
        if (saved) {
          const found = data.find(c => c.code === saved);
          if (found) { setSelectedCurrency(found); setLoading(false); return; }
        }
      } catch (_) {}
      // Default to USD, or first in list
      const usd = data.find(c => c.code === 'USD');
      setSelectedCurrency(usd || data[0]);
    } else {
      setCurrencies([DEFAULT_CURRENCY]);
      setSelectedCurrency(DEFAULT_CURRENCY);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadCurrencies(); }, [loadCurrencies]);

  const changeCurrency = useCallback((cur) => {
    setSelectedCurrency(cur);
    try { localStorage.setItem('nf_currency', cur.code); } catch (_) {}
  }, []);

  // Convert + format a USD amount into the selected currency
  const format = useCallback((usdAmount) => {
    const amt    = Number(usdAmount) || 0;
    const rate   = Number(selectedCurrency.rate) || 1;
    const symbol = selectedCurrency.symbol || '$';
    return symbol + (amt * rate).toFixed(2);
  }, [selectedCurrency]);

  return (
    <CurrencyContext.Provider value={{
      currency:    selectedCurrency,
      currencies,
      setCurrency: changeCurrency,
      format,
      loading,
      reload: loadCurrencies, loadCurrencies,
    }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  return useContext(CurrencyContext);
}

export default CurrencyContext;
