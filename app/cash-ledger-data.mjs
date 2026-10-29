export function collectCashRows(data) {
  const manual = (data.movements || []).map(m => ({ ...m, source: 'manual' }));
  const payments = (data.requests || []).filter(r => ['paid', 'closed'].includes(r.status)).map(r => {
    const proof = data.evidence.find(e => e.request === r.id && e.kind === 'payment');
    return {
      id: r.id, source: 'request', direction: 'debit', amount: r.amount,
      date: r.paid_date || r.created.slice(0, 10), description: r.purpose,
      project: r.project, counterparty: r.payee || r.requester_name,
      method: r.method, reference: r.reference,
      actor: proof?.uploaded_by || 'Registo anterior', created: proof?.created || r.created
    };
  });
  return [...manual, ...payments];
}
