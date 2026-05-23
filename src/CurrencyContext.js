import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from './supabase';

const CurrencyContext = createContext();

export function CurrencyProvider({ children }) {
  // Default is PKR — the platform's base deposit currency
  const [currency, setCurrency] = useState({
    code: 'PKR', symbol: '₨', name: 'Pakistani Rupee', rate: 278
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
      // Check if user previously selected a currency
      const saved = localStorage.getItem('nf_currency_code');
      if (saved) {
        const found = data.find(c => c.code === saved);
        if (found) { setCurrency(found); setLoaded(true); return; }
      }
      // Default to PKR if available, otherwise first currency
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

  // format converts a USD amount to the user's selected currency
  // Deposits are stored in their actual currency (PKR or USDT)
  // Services/orders are priced in USD internally
  const format = (usdAmount) => {
    const amt = parseFloat(usdAmount) || 0;
    const converted = amt * parseFloat(currency.rate || 1);
    const decimals = ['USD', 'EUR', 'GBP', 'AED', 'SAR'].includes(currency.code) ? 2 : 0;
    return `${currency.symbol}${converted.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
  };

  // formatDeposit: show deposit amounts in their stored currency (NOT converted)
  // Deposits stored as PKR stay as PKR, USDT stays as USDT
  const formatDeposit = (amount, method) => {
    const amt = parseFloat(amount) || 0;
    if (method && (method.toLowerCase().includes('binance') || method.toLowerCase().includes('usdt'))) {
      return `$${amt.toFixed(2)} USDT`;
    }
    // PKR/Easypaisa/JazzCash
    return `₨${amt.toLocaleString()} PKR`;
  };

  return (
    <CurrencyContext.Provider value={{ currency, allCurrencies, changeCurrency, format, formatDeposit, loadCurrencies, loaded }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export const useCurrency = () => useContext(CurrencyContext);
