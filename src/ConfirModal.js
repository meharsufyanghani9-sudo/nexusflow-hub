// ── Global Reusable Confirm Modal ──
// Usage: import { useConfirm, ConfirmModal } from './ConfirmModal';
// const { confirmState, requestConfirm, handleConfirm, handleCancel } = useConfirm();
// <ConfirmModal {...confirmState} onConfirm={handleConfirm} onCancel={handleCancel} />

import React, { useState } from 'react';

export function ConfirmModal({ open, icon, title, message, confirmText, confirmColor, onConfirm, onCancel }) {
  if (!open) return null;
  const isDanger = confirmColor === 'danger';
  const color = isDanger ? '#ff6b6b' : 'var(--green)';
  const bg = isDanger ? 'rgba(255,50,80,.12)' : 'rgba(0,255,136,.1)';
  const border = isDanger ? 'rgba(255,50,80,.3)' : 'rgba(0,255,136,.3)';

  return (
    <div style={{
      position:'fixed', inset:0, background:'rgba(0,0,0,.75)',
      display:'flex', alignItems:'center', justifyContent:'center',
      zIndex:99999, padding:'20px',
    }} onClick={onCancel}>
      <div style={{
        background:'var(--bg2)', border:'1px solid var(--br)',
        borderRadius:'18px', padding:'30px 24px', maxWidth:'320px',
        width:'100%', textAlign:'center',
        boxShadow:'0 24px 64px rgba(0,0,0,.6)',
        animation:'fadeIn .15s ease',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize:'36px', marginBottom:'12px' }}>{icon || (isDanger ? '⚠️' : '✅')}</div>
        <div style={{ fontWeight:800, fontSize:'16px', color:'var(--text)', marginBottom:'8px' }}>{title}</div>
        <div style={{ fontSize:'13px', color:'var(--text3)', marginBottom:'24px', lineHeight:1.6 }}>{message}</div>
        <div style={{ display:'flex', gap:'10px' }}>
          <button onClick={onCancel} style={{
            flex:1, padding:'12px', borderRadius:'10px', cursor:'pointer',
            background:'var(--gl)', border:'1px solid var(--br)',
            color:'var(--text2)', fontWeight:700, fontSize:'13px',
          }}>Cancel</button>
          <button onClick={onConfirm} style={{
            flex:1, padding:'12px', borderRadius:'10px', cursor:'pointer',
            background: bg, border: `1px solid ${border}`,
            color: color, fontWeight:800, fontSize:'13px',
          }}>{confirmText || 'Confirm'}</button>
        </div>
      </div>
    </div>
  );
}

export function useConfirm() {
  const [confirmState, setConfirmState] = useState({ open: false });
  const [resolver, setResolver] = useState(null);

  const confirm = (options) => {
    return new Promise((resolve) => {
      setConfirmState({ open: true, ...options });
      setResolver(() => resolve);
    });
  };

  const handleConfirm = () => {
    setConfirmState({ open: false });
    resolver && resolver(true);
  };

  const handleCancel = () => {
    setConfirmState({ open: false });
    resolver && resolver(false);
  };

  return { confirmState, confirm, handleConfirm, handleCancel };
}
