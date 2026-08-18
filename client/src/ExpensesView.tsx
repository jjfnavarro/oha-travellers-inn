import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { Ban, ReceiptText } from 'lucide-react';
import { apiRequest } from './api';

interface Expense {
  id: number;
  amountCentavos: number;
  reason: string;
  status: 'ACTIVE' | 'VOIDED';
  businessDate: string;
  createdAt: string;
  recordedBy: { id: number; username: string };
  voidedBy: { id: number; username: string } | null;
  voidReason: string | null;
  shift: { id: number; type: 'DAY' | 'NIGHT' };
}

function money(centavos: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 0,
  }).format(centavos / 100);
}

function amountInCentavos(value: string): number | null {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value.trim())) return null;
  const amount = Math.round(Number(value) * 100);
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}

export function ExpensesView({ isOwner }: { isOwner: boolean }) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isOwner);
  const [message, setMessage] = useState<string | null>(null);

  const loadExpenses = useCallback(async () => {
    if (!isOwner) return;
    setLoading(true);
    try {
      const result = await apiRequest<{ data: Expense[] }>('/expenses');
      setExpenses(result.data);
    } catch (error: unknown) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Expenses could not be loaded.',
      );
    } finally {
      setLoading(false);
    }
  }, [isOwner]);

  useEffect(() => {
    void loadExpenses();
  }, [loadExpenses]);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const centavos = amountInCentavos(amount);
    if (!centavos || !reason.trim()) {
      setMessage('Enter a positive amount and a reason.');
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      await apiRequest('/expenses', {
        method: 'POST',
        body: JSON.stringify({
          amountCentavos: centavos,
          reason: reason.trim(),
          idempotencyKey,
        }),
      });
      setAmount('');
      setReason('');
      setIdempotencyKey(crypto.randomUUID());
      setMessage('Cash expense recorded.');
      await loadExpenses();
    } catch (error: unknown) {
      setMessage(
        error instanceof Error ? error.message : 'Expense could not be saved.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function voidExpense(expense: Expense): Promise<void> {
    const reason = window.prompt(
      `Void ${money(expense.amountCentavos)} expense: ${expense.reason}\n\nEnter the correction reason:`,
    );
    if (!reason?.trim()) return;
    setMessage(null);
    try {
      await apiRequest(`/expenses/${expense.id}/void`, {
        method: 'POST',
        body: JSON.stringify({ reason: reason.trim() }),
      });
      await loadExpenses();
    } catch (error: unknown) {
      setMessage(
        error instanceof Error ? error.message : 'Expense could not be voided.',
      );
    }
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <h2>Expenses</h2>
          <p>Business expenses paid from physical Cash</p>
        </div>
      </div>
      <section className="expense-entry">
        <div className="section-heading">
          <ReceiptText size={22} aria-hidden="true" />
          <h3>Record expense</h3>
        </div>
        <form onSubmit={(event) => void submit(event)}>
          <label>
            Amount
            <input
              required
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </label>
          <label>
            Reason
            <textarea
              required
              maxLength={500}
              rows={3}
              placeholder="Example: Bought cleaning materials"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <div className="cash-only-note">
            <strong>Cash expense</strong>
            <span>Expenses are deducted only from physical Cash.</span>
          </div>
          <button className="primary-button" type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Save expense'}
          </button>
        </form>
      </section>
      {message && (
        <p className="form-message" role="status">
          {message}
        </p>
      )}
      {isOwner && (
        <section className="expense-history">
          <h3>Expense history</h3>
          {loading ? (
            <p>Loading expenses...</p>
          ) : expenses.length === 0 ? (
            <p className="empty-state">No expenses recorded.</p>
          ) : (
            <div className="data-table-wrap">
              <table className="data-table expense-table">
                <thead>
                  <tr>
                    <th>Date and time</th>
                    <th>Reason</th>
                    <th>Staff</th>
                    <th>Shift</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((expense) => (
                    <tr key={expense.id}>
                      <td>
                        {new Date(expense.createdAt).toLocaleString('en-PH')}
                      </td>
                      <td>{expense.reason}</td>
                      <td>{expense.recordedBy.username}</td>
                      <td>{expense.shift.type === 'DAY' ? 'Day' : 'Night'}</td>
                      <td>{money(expense.amountCentavos)}</td>
                      <td>
                        {expense.status === 'ACTIVE' ? 'Active' : 'Voided'}
                      </td>
                      <td>
                        {expense.status === 'ACTIVE' && (
                          <button
                            className="secondary-button icon-text-button"
                            type="button"
                            onClick={() => void voidExpense(expense)}
                          >
                            <Ban size={16} aria-hidden="true" />
                            Void
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </>
  );
}
