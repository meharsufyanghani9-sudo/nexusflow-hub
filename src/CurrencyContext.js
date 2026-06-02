import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from './supabase';

const CurrencyContext = createContext();

// Default PKR — matches the panel's primary currency
const PKR_DEFAULT = { code:'PKR', symbol:'Rs', name:'Pakistani Rupee', rate:280 };

export function CurrencyProvider({ children }) {
  const [currency, setCurrency]         = useState(PKR_DEFAULT);
  const [allCurrencies, setAllCurrencies] = useState([]);
  const [loaded, setLoaded]             = useState(false);

  useEffect(() => { loadCurrencies(); }, []);

  const loadCurrencies = async () => {
    const { data } = await supabase
      .from('currencies').select('*')
      .eq('is_active', true).order('code');
    if (data && data.length > 0) {
      setAllCurrencies(data);
      // Try to restore saved preference
      const saved = localStorage.getItem('nf_currency_code');
      if (saved) {
        const found = data.find(c => c.code === saved);
        if (found) { setCurrency(found); setLoaded(true); return; }
      }
      // Default to PKR if available, otherwise USD
      const pkr = data.find(c => c.code === 'PKR');
      const usd = data.find(c => c.code === 'USD');
      if (pkr) setCurrency(pkr);
      else if (usd) setCurrency(usd);
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
    // PKR shows 0 decimal places; USD/EUR show 2
    const decimals = ['USD','EUR','GBP'].includes(currency.code) ? 2 : 0;
    return `${currency.symbol}${converted.toFixed(decimals)}`;
  };

  // Format raw PKR amount (for deposits — already in PKR, don't convert)
  const formatPKR = (pkrAmount) => {
    return `PKR ${parseFloat(pkrAmount||0).toLocaleString()}`;
  };

  return (
    <CurrencyContext.Provider value={{ currency, allCurrencies, changeCurrency, format, formatPKR, loadCurrencies, loaded }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export const useCurrency = () => useContext(CurrencyContext);
