import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';

export default function AdminDisputes() {
  const [disputes, setDisputes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [note, setNote] = useState('');
  const [acting, setActing] = useState(false);

  useEffect(() => { loadDisputes(); }, []);

  const loadDisputes = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('orders')
      .select('*')
      .eq('status', 'disputed')
      .order('created_at', { ascending: false });
    if (data) setDisputes(data);
    setLoading(false);
  };

  const resolve = async (order, action) => {
    setActing(true);
    if (action === 'refund') {
      const { data: u } = await supabase
        .from('users').select('balance').eq('id', order.user_id).single();
      if (u) {
        await supabase.from('users')
          .update({ balance: parseFloat(u.balance) + parseFloat(order.cost) })
          .eq('id', order.user_id);
        await supabase.from('transactions').insert({
          user_id: order.user_id,
          type: 'refund',
          amount: order.cost,
          description: `Refund: ${order.service_name}`,
          ref_id: order.order_ref,
        });
      }
      await supabase.from('orders').update({ status: 'cancelled' }).eq('id', order.id);
    } else {
      await supabase.from('orders').update({ status: 'completed' }).eq('id', order.id);
    }
    setActing(false);
    setSelected(null);
    loadDisputes();
    alert(action === 'refund' ? '✅ Refund issued!' : '✅ Marked as completed!');
  };

  return (
    <div>
      <div className="cgrid" style={{ marginBottom: '16px' }}>
        {[
          { ic: '⚖️', lb: 'Open Disputes', vl: disputes.length, cl: 'cd' },
          { ic: '⏳', lb: 'Pending Review', vl: disputes.length, cl: 'cw' },
        ].map((s, i) => (
          <div key={i} className="sc">
            <span className="sc-ic">{s.ic}</span>
            <div className="sc-lb">{s.lb}</div>
            <div className={`sc-vl ${s.cl}`}>{s.vl}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text3)' }}>Loading...</div>
      ) : disputes.length === 0 ? (
        <div className="empty">
          <span className="empty-ic">⚖️</span>
          <div className="empty-tx">No open disputes</div>
          <div className="empty-sb">All disputes resolved!</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {disputes.map(d => (
            <div key={d.id} className="card" style={{ padding: '16px', borderColor: 'rgba(255,51,85,.2)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
                <div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontFamily: 'var(--fm)', fontSize: '11px', color: 'var(--neon)' }}>{d.order_ref}</span>
                    <span className="bdg b-rejected">Disputed</span>
                  </div>
                  <div style={{ fontWeight: 700, marginBottom: '3px' }}>{d.service_name}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '6px' }}>Link: {d.link}</div>
                  <div style={{ display: 'flex', gap: '12px', fontSize: '11px' }}>
                    <span><span style={{ color: 'var(--text3)' }}>Qty: </span>{d.quantity?.toLocaleString()}</span>
                    <span><span style={{ color: 'var(--text3)' }}>Cost: </span><span style={{ color: 'var(--gold)' }}>${parseFloat(d.cost || 0).toFixed(2)}</span></span>
                    <span><span style={{ color: 'var(--text3)' }}>Date: </span>{new Date(d.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
                <button className="btn bp bsm" onClick={() => setSelected(d)}>Review →</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {selected && (
        <div className="mlay" onClick={e => e.target.classList.contains('mlay') && setSelected(null)}>
          <div className="mbox">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div className="mttl">Resolve Dispute</div>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: '18px', cursor: 'pointer' }}>✕</button>
            </div>
            <div className="card" style={{ padding: '13px', marginBottom: '16px' }}>
              <div style={{ fontWeight: 700, marginBottom: '4px' }}>{selected.service_name}</div>
              <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '6px' }}>Order: {selected.order_ref}</div>
              <div style={{ display: 'flex', gap: '12px', fontSize: '12px' }}>
                <span>Qty: {selected.quantity?.toLocaleString()}</span>
                <span style={{ color: 'var(--gold)', fontWeight: 700 }}>Cost: ${parseFloat(selected.cost || 0).toFixed(2)}</span>
              </div>
            </div>
            <div className="fi">
              <label className="fl">Admin Note (optional)</label>
              <input className="inp" placeholder="Resolution note..." value={note} onChange={e => setNote(e.target.value)} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <button className="btn bs blg" onClick={() => resolve(selected, 'complete')} disabled={acting}>
                ✅ Mark Complete
              </button>
              <button className="btn bd blg" onClick={() => resolve(selected, 'refund')} disabled={acting}>
                ↩️ Issue Refund
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
