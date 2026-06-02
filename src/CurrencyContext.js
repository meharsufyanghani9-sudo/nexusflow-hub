import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from './supabase';

const CurrencyContext = createContext();

export function CurrencyProvider({ children }) {
  const [currency, setCurrency] = useState({
    code:'USD', symbol:'$', name:'US Dollar', rate:1
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
        const found = data.find(c => c.code === saved);
        if (found) setCurrency(found);
      }
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
    const decimals = ['USD','EUR','GBP'].includes(currency.code) ? 2 : 0;
    return `${currency.symbol}${converted.toFixed(decimals)}`;
  };

  return (
    <CurrencyContext.Provider value={{ currency, allCurrencies, changeCurrency, format, loadCurrencies }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export const useCurrency = () => useContext(CurrencyContext);