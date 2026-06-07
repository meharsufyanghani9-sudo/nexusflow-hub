import React from 'react';
import { useCurrency } from './CurrencyContext';

export default function CurrencySwitcher({ onClose }) {
  const { currency, currencies, setCurrency, loading } = useCurrency();

  const handleSelect = (cur) => {
    setCurrency(cur);
    onClose();
  };

  return (
    <div className="mlay" onClick={e => e.target.classList.contains('mlay') && onClose()}>
      <div className="mbox" style={{ maxWidth: '380px' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div className="mttl">💱 Select Currency</div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: '18px', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>

        {/* Current */}
        <div style={{
          padding: '10px 14px', borderRadius: '8px', marginBottom: '14px',
          background: 'rgba(0,212,255,.06)', border: '1px solid var(--br)',
          fontSize: '12px', color: 'var(--text2)',
        }}>
          Current: <strong style={{ color: 'var(--neon)' }}>
            {currency.symbol} {currency.code} — {currency.name}
          </strong>
        </div>

        {/* List */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text3)', fontSize: '12px' }}>
            Loading currencies…
          </div>
        ) : currencies.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text3)', fontSize: '12px' }}>
            No currencies available.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '340px', overflowY: 'auto' }}>
            {currencies.map(cur => {
              const isActive = cur.code === currency.code;
              return (
                <div
                  key={cur.code}
                  onClick={() => handleSelect(cur)}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '11px 14px', borderRadius: '8px', cursor: 'pointer',
                    background: isActive ? 'rgba(0,212,255,.10)' : 'var(--bg2)',
                    border: isActive ? '1px solid rgba(0,212,255,.35)' : '1px solid var(--br)',
                    transition: 'all .15s',
                  }}
                  onMouseOver={e => { if (!isActive) e.currentTarget.style.background = 'var(--gl2)'; }}
                  onMouseOut={e => { if (!isActive) e.currentTarget.style.background = 'var(--bg2)'; }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{
                      fontFamily: 'var(--fd)', fontSize: '16px', fontWeight: 800,
                      color: isActive ? 'var(--neon)' : 'var(--text)',
                      minWidth: '28px', textAlign: 'center',
                    }}>
                      {cur.symbol}
                    </span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '13px', color: isActive ? 'var(--neon)' : 'var(--text)' }}>
                        {cur.code}
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--text3)' }}>{cur.name}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text3)' }}>
                      ×{Number(cur.rate).toFixed(4)}
                    </span>
                    {isActive && (
                      <span style={{
                        fontSize: '10px', fontWeight: 700, color: 'var(--neon)',
                        background: 'rgba(0,212,255,.12)', padding: '2px 7px', borderRadius: '4px',
                      }}>
                        ACTIVE
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
