import React from 'react';
import { useCurrency } from './CurrencyContext';

export default function CurrencySwitcher({ onClose }) {
  const { currency, allCurrencies, changeCurrency } = useCurrency();

  const select = (curr) => {
    changeCurrency(curr);
    onClose();
  };

  return (
    <div className="mlay" onClick={e => e.target.classList.contains('mlay') && onClose()}>
      <div className="mbox">
        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'14px' }}>
          <div className="mttl">💱 Change Currency</div>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--text3)', fontSize:'18px', cursor:'pointer' }}>✕</button>
        </div>
        <p style={{ fontSize:'11px', color:'var(--text3)', marginBottom:'14px', lineHeight:1.6 }}>
          All prices across the panel will change instantly to your selected currency.
        </p>
        <div style={{ display:'flex', flexDirection:'column', gap:'7px' }}>
          {allCurrencies.length === 0 && (
            <div style={{ textAlign:'center', padding:'20px', color:'var(--text3)' }}>Loading currencies...</div>
          )}
          {allCurrencies.map(c => (
            <div key={c.code} onClick={() => select(c)} style={{
              display:'flex', justifyContent:'space-between', alignItems:'center',
              padding:'11px 14px', borderRadius:'8px', cursor:'pointer',
              border:`1px solid ${currency.code===c.code ? 'var(--neon)' : 'var(--br)'}`,
              background: currency.code===c.code ? 'var(--gl2)' : 'var(--gl)',
              transition:'all .15s'
            }}>
              <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
                <span style={{
                  fontFamily:'var(--fm)', fontWeight:700, fontSize:'18px',
                  color: currency.code===c.code ? 'var(--neon)' : 'var(--text2)',
                  minWidth:'28px', textAlign:'center'
                }}>{c.symbol}</span>
                <div>
                  <div style={{ fontSize:'13px', fontWeight:700, color: currency.code===c.code ? 'var(--neon)' : 'var(--text)' }}>{c.code}</div>
                  <div style={{ fontSize:'10px', color:'var(--text3)' }}>{c.name}</div>
                </div>
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontSize:'11px', color:'var(--text3)', fontFamily:'var(--fm)' }}>
                  1 USD = {parseFloat(c.rate).toLocaleString()} {c.code}
                </div>
                {currency.code === c.code && (
                  <div style={{ fontSize:'9px', color:'var(--green)', marginTop:'2px' }}>✓ Active</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}