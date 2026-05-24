import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from './supabase';

const CurrencyContext = createContext();

export function CurrencyProvider({ children }) {
  // Default is PKR — user can change via currency switcher
  const [currency, setCurrency] = useState({
    code: 'PKR', symbol: 'Rs', name: 'Pakistani Rupee', rate: 278
  });
  const [allCurrencies, setAllCurrencies] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => { loadCurrencies(); }, []);

  const loadCurrencies = async () => {
    const { data } = await supabase
      .from('currencies').select('*')
      .eq('is_active', true).order('code');
    if (data && data.length > 0) {
      setAllCurrencies(data);
      const saved = localStorage.getItem('nf_currency_code');
      if (saved) {
        // Respect user's saved preference
        const found = data.find(c => c.code === saved);
        if (found) { setCurrency(found); setLoaded(true); return; }
      }
      // No saved preference — use PKR if available, else first currency
      const pkr = data.find(c => c.code === 'PKR');
      if (pkr) setCurrency(pkr);
      else setCurrency(data[0]);
    }
    setLoaded(true);
  };

  const changeCurrency = (curr) => {
    setCurrency(curr);
    localStorage.setItem('nf_currency_code', curr.code);
  };

  const format = (usdAmount) => {
    const amt = parseFloat(usdAmount) || 0;
    const converted = amt * parseFloat(currency.rate || 1);
    const decimals = ['USD', 'EUR', 'GBP'].includes(currency.code) ? 2 : 0;
    return `${currency.symbol}${converted.toFixed(decimals)}`;
  };

  // Format with explicit decimals control
  const formatFixed = (usdAmount, dec = 2) => {
    const amt = parseFloat(usdAmount) || 0;
    const converted = amt * parseFloat(currency.rate || 1);
    return `${currency.symbol}${converted.toFixed(dec)}`;
  };

  return (
    <CurrencyContext.Provider value={{ currency, allCurrencies, changeCurrency, format, formatFixed, loadCurrencies, loaded }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export const useCurrency = () => useContext(CurrencyContext);
