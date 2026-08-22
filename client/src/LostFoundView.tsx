import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from 'react';
import {
  CheckCircle2,
  Eye,
  PackageSearch,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { apiRequest } from './api';
import { resolveHistoryWindow, type HistoryPeriod } from './history-period';

type LostFoundStatus = 'UNCLAIMED' | 'CLAIMED' | 'DISPOSED';
type StaffRole = 'OWNER' | 'FRONT_DESK';

interface LostFoundRoom {
  id: number;
  number: string;
  operationalStatus: 'ACTIVE' | 'CLEANING' | 'MAINTENANCE' | 'INACTIVE';
}

interface EligibleStay {
  id: number;
  guestName: string | null;
  checkedInAt: string;
  checkedOutAt: string | null;
}

interface LostFoundItem {
  id: number;
  itemName: string;
  description: string | null;
  roomId: number;
  room: LostFoundRoom;
  stayId: number | null;
  stay: (EligibleStay & { status: string }) | null;
  foundAt: string;
  recordedBy: { id: number; username: string };
  status: LostFoundStatus;
  notes: string | null;
  claimedAt: string | null;
  claimedByName: string | null;
  claimNotes: string | null;
  claimProcessedBy: { id: number; username: string } | null;
  disposedAt: string | null;
  disposalNotes: string | null;
  disposedBy: { id: number; username: string } | null;
  createdAt: string;
  updatedAt: string;
}

interface ApiCollection<T> {
  data: T[];
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function manilaOperationalDate(): string {
  const manila = new Date(Date.now() + 8 * 60 * 60 * 1000);
  if (manila.getUTCHours() < 8) manila.setUTCDate(manila.getUTCDate() - 1);
  return manila.toISOString().slice(0, 10);
}

function manilaDateTimeInput(): string {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 16);
}

function foundAtIso(value: string): string {
  return new Date(`${value}:00+08:00`).toISOString();
}

function statusLabel(status: LostFoundStatus): string {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

export function LostFoundView({
  role,
  rooms,
  initialRoomId,
  onInitialRoomHandled,
}: {
  role: StaffRole;
  rooms: LostFoundRoom[];
  initialRoomId: number | null;
  onInitialRoomHandled: () => void;
}) {
  const [items, setItems] = useState<LostFoundItem[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'ALL' | LostFoundStatus>('UNCLAIMED');
  const [roomId, setRoomId] = useState('');
  const [period, setPeriod] = useState<HistoryPeriod>('ALL');
  const [referenceDate] = useState(manilaOperationalDate);
  const [from, setFrom] = useState(manilaOperationalDate);
  const [to, setTo] = useState(manilaOperationalDate);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState<LostFoundItem | 'NEW' | null>(null);
  const [createRoomId, setCreateRoomId] = useState<number | null>(null);
  const [selected, setSelected] = useState<LostFoundItem | null>(null);
  const [claiming, setClaiming] = useState<LostFoundItem | null>(null);
  const [disposing, setDisposing] = useState<LostFoundItem | null>(null);

  const query = useMemo(() => {
    const parameters = new URLSearchParams();
    if (search.trim()) parameters.set('q', search.trim());
    if (status !== 'ALL') parameters.set('status', status);
    if (roomId) parameters.set('roomId', roomId);
    const window = resolveHistoryWindow(period, referenceDate, from, to);
    if (window.from) parameters.set('from', window.from);
    if (window.to) parameters.set('to', window.to);
    return parameters.toString();
  }, [from, period, referenceDate, roomId, search, status, to]);

  const loadItems = useCallback(async (): Promise<void> => {
    try {
      const response = await apiRequest<ApiCollection<LostFoundItem>>(
        `/lost-found?${query}`,
      );
      setItems(response.data);
      setMessage(null);
    } catch (error: unknown) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Lost & Found records could not be loaded.',
      );
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadItems(), 200);
    return () => window.clearTimeout(timer);
  }, [loadItems]);

  useEffect(() => {
    if (initialRoomId === null) return;
    setCreateRoomId(initialRoomId);
    setEditing('NEW');
    onInitialRoomHandled();
  }, [initialRoomId, onInitialRoomHandled]);

  async function remove(item: LostFoundItem): Promise<void> {
    const reason = window.prompt(
      `Why should the mistaken or duplicate record “${item.itemName}” be permanently deleted?`,
    );
    if (!reason?.trim()) return;
    if (!window.confirm('Permanently delete this unclaimed record?')) return;
    try {
      await apiRequest(`/lost-found/${item.id}`, {
        method: 'DELETE',
        body: JSON.stringify({ reason }),
      });
      setSelected(null);
      await loadItems();
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : 'Delete failed.');
    }
  }

  return (
    <section className="lost-found-view">
      <div className="page-heading">
        <div>
          <h2>Lost &amp; Found</h2>
          <p>Record and locate belongings found in guest rooms.</p>
        </div>
        <button
          className="primary-button"
          onClick={() => {
            setCreateRoomId(null);
            setEditing('NEW');
          }}
        >
          <Plus size={18} aria-hidden="true" />
          Record item
        </button>
      </div>

      <div className="lost-found-filters">
        <label className="lost-found-search">
          <span className="visually-hidden">Search Lost &amp; Found</span>
          <Search size={18} aria-hidden="true" />
          <input
            type="search"
            placeholder="Search item, description, or room"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <label>
          <span>Status</span>
          <select
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as 'ALL' | LostFoundStatus)
            }
          >
            <option value="ALL">All statuses</option>
            <option value="UNCLAIMED">Unclaimed</option>
            <option value="CLAIMED">Claimed</option>
            <option value="DISPOSED">Disposed</option>
          </select>
        </label>
        <label>
          <span>Room</span>
          <select
            value={roomId}
            onChange={(event) => setRoomId(event.target.value)}
          >
            <option value="">All rooms</option>
            {rooms.map((room) => (
              <option value={room.id} key={room.id}>
                Room {room.number}
                {room.operationalStatus === 'INACTIVE' ? ' (Archived)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Date found</span>
          <select
            value={period}
            onChange={(event) => setPeriod(event.target.value as HistoryPeriod)}
          >
            <option value="ALL">All dates</option>
            <option value="TODAY">Today</option>
            <option value="WEEK">This week</option>
            <option value="MONTH">This month</option>
            <option value="CUSTOM">Custom</option>
          </select>
        </label>
        {period === 'CUSTOM' && (
          <div className="lost-found-custom-dates">
            <label>
              <span>From</span>
              <input
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
              />
            </label>
            <label>
              <span>To</span>
              <input
                type="date"
                value={to}
                onChange={(event) => setTo(event.target.value)}
              />
            </label>
          </div>
        )}
      </div>

      {message && (
        <p className="form-error" role="alert">
          {message}
        </p>
      )}
      {loading ? (
        <p className="empty-state">Loading Lost &amp; Found...</p>
      ) : items.length === 0 ? (
        <div className="lost-found-empty">
          <PackageSearch size={30} aria-hidden="true" />
          <p>No records match these filters.</p>
        </div>
      ) : (
        <div className="lost-found-grid">
          {items.map((item) => (
            <article className="lost-found-card" key={item.id}>
              <div className="lost-found-card-heading">
                <div>
                  <span>Room {item.room.number}</span>
                  <h3>{item.itemName}</h3>
                </div>
                <span
                  className={`lost-found-status ${item.status.toLowerCase()}`}
                >
                  {statusLabel(item.status)}
                </span>
              </div>
              <p>{item.description || 'No description recorded.'}</p>
              <dl>
                <div>
                  <dt>Found</dt>
                  <dd>{formatDateTime(item.foundAt)}</dd>
                </div>
                <div>
                  <dt>Recorded by</dt>
                  <dd>{item.recordedBy.username}</dd>
                </div>
              </dl>
              <button
                className="secondary-button"
                onClick={() => setSelected(item)}
              >
                <Eye size={16} aria-hidden="true" />
                View details
              </button>
            </article>
          ))}
        </div>
      )}

      {editing && (
        <LostFoundFormDialog
          item={editing === 'NEW' ? null : editing}
          rooms={rooms}
          role={role}
          initialRoomId={editing === 'NEW' ? createRoomId : null}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await loadItems();
          }}
        />
      )}
      {selected && (
        <LostFoundDetailsDialog
          item={selected}
          role={role}
          onClose={() => setSelected(null)}
          onEdit={() => {
            setEditing(selected);
            setSelected(null);
          }}
          onClaim={() => {
            setClaiming(selected);
            setSelected(null);
          }}
          onDispose={() => {
            setDisposing(selected);
            setSelected(null);
          }}
          onDelete={() => void remove(selected)}
        />
      )}
      {claiming && (
        <ProcessDialog
          title={`Mark “${claiming.itemName}” claimed`}
          kind="claim"
          onClose={() => setClaiming(null)}
          onSubmit={async (values) => {
            await apiRequest(`/lost-found/${claiming.id}/claim`, {
              method: 'POST',
              body: JSON.stringify({
                claimedByName: values.name || null,
                notes: values.notes || null,
              }),
            });
            setClaiming(null);
            await loadItems();
          }}
        />
      )}
      {disposing && (
        <ProcessDialog
          title={`Dispose “${disposing.itemName}”`}
          kind="dispose"
          onClose={() => setDisposing(null)}
          onSubmit={async (values) => {
            await apiRequest(`/lost-found/${disposing.id}/dispose`, {
              method: 'POST',
              body: JSON.stringify({ notes: values.notes }),
            });
            setDisposing(null);
            await loadItems();
          }}
        />
      )}
    </section>
  );
}

function LostFoundFormDialog({
  item,
  rooms,
  role,
  initialRoomId,
  onClose,
  onSaved,
}: {
  item: LostFoundItem | null;
  rooms: LostFoundRoom[];
  role: StaffRole;
  initialRoomId: number | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [itemName, setItemName] = useState(item?.itemName ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [roomId, setRoomId] = useState(
    String(item?.roomId ?? initialRoomId ?? rooms[0]?.id ?? ''),
  );
  const [stayId, setStayId] = useState(String(item?.stayId ?? ''));
  const [foundAt, setFoundAt] = useState(manilaDateTimeInput);
  const [notes, setNotes] = useState(item?.notes ?? '');
  const [stays, setStays] = useState<EligibleStay[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!roomId) return;
    apiRequest<ApiCollection<EligibleStay>>(
      `/lost-found/eligible-stays?roomId=${roomId}`,
    )
      .then((response) => {
        const currentStay =
          item?.stay && item.roomId === Number(roomId) ? item.stay : null;
        setStays(
          currentStay &&
            !response.data.some((stay) => stay.id === currentStay.id)
            ? [currentStay, ...response.data]
            : response.data,
        );
      })
      .catch((error: unknown) =>
        setMessage(
          error instanceof Error
            ? error.message
            : 'Recent stays could not be loaded.',
        ),
      );
  }, [item, roomId]);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await apiRequest(item ? `/lost-found/${item.id}` : '/lost-found', {
        method: item ? 'PATCH' : 'POST',
        body: JSON.stringify({
          itemName,
          description: description || null,
          roomId: Number(roomId),
          stayId: stayId ? Number(stayId) : null,
          ...(!item ? { foundAt: foundAtIso(foundAt) } : {}),
          notes: notes || null,
        }),
      });
      await onSaved();
    } catch (error: unknown) {
      setMessage(
        error instanceof Error ? error.message : 'The item could not be saved.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        className="dialog lost-found-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lost-found-form-title"
      >
        <div className="dialog-header">
          <div>
            <p className="dialog-eyebrow">Lost &amp; Found</p>
            <h2 id="lost-found-form-title">
              {item ? 'Edit item' : 'Record found item'}
            </h2>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <form onSubmit={(event) => void submit(event)}>
          <label>
            Item name
            <input
              autoFocus
              required
              maxLength={100}
              value={itemName}
              onChange={(event) => setItemName(event.target.value)}
            />
          </label>
          <label>
            Description
            <textarea
              maxLength={1000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <div className="lost-found-form-row">
            <label>
              <span className="field-label">Room</span>
              <select
                required
                value={roomId}
                onChange={(event) => {
                  setRoomId(event.target.value);
                  setStayId('');
                }}
              >
                {rooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    Room {room.number}
                    {room.operationalStatus === 'INACTIVE' ? ' (Archived)' : ''}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="field-label">
                Associated stay <span className="optional-label">Optional</span>
              </span>
              <select
                value={stayId}
                onChange={(event) => setStayId(event.target.value)}
              >
                <option value="">Not linked</option>
                {stays.map((stay) => (
                  <option key={stay.id} value={stay.id}>
                    #{stay.id} · {stay.guestName || 'Guest not recorded'} ·{' '}
                    {formatDateTime(stay.checkedOutAt ?? stay.checkedInAt)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {!item && (
            <label>
              Date and time found
              <input
                required
                type="datetime-local"
                value={foundAt}
                onChange={(event) => setFoundAt(event.target.value)}
              />
            </label>
          )}
          {item && role === 'FRONT_DESK' && item.status !== 'UNCLAIMED' && (
            <p className="form-help">
              Only the Owner can correct a claimed or disposed record.
            </p>
          )}
          <label>
            Notes
            <textarea
              maxLength={1000}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>
          {message && (
            <p className="form-error" role="alert">
              {message}
            </p>
          )}
          <div className="dialog-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
            >
              Cancel
            </button>
            <button className="primary-button" disabled={saving}>
              {saving ? 'Saving...' : 'Save item'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function LostFoundDetailsDialog({
  item,
  role,
  onClose,
  onEdit,
  onClaim,
  onDispose,
  onDelete,
}: {
  item: LostFoundItem;
  role: StaffRole;
  onClose: () => void;
  onEdit: () => void;
  onClaim: () => void;
  onDispose: () => void;
  onDelete: () => void;
}) {
  const canEdit = role === 'OWNER' || item.status === 'UNCLAIMED';
  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        className="dialog lost-found-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lost-found-details-title"
      >
        <div className="dialog-header">
          <div>
            <p className="dialog-eyebrow">Room {item.room.number}</p>
            <h2 id="lost-found-details-title">{item.itemName}</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <span className={`lost-found-status ${item.status.toLowerCase()}`}>
          {statusLabel(item.status)}
        </span>
        <dl className="lost-found-details">
          <div>
            <dt>Description</dt>
            <dd>{item.description || 'Not recorded'}</dd>
          </div>
          <div>
            <dt>Found</dt>
            <dd>{formatDateTime(item.foundAt)}</dd>
          </div>
          <div>
            <dt>Recorded by</dt>
            <dd>{item.recordedBy.username}</dd>
          </div>
          <div>
            <dt>Associated stay</dt>
            <dd>
              {item.stay
                ? `#${item.stay.id} · ${item.stay.guestName || 'Guest not recorded'}`
                : 'Not linked'}
            </dd>
          </div>
          <div>
            <dt>Notes</dt>
            <dd>{item.notes || 'None'}</dd>
          </div>
          {item.status === 'CLAIMED' && (
            <>
              <div>
                <dt>Claimed</dt>
                <dd>
                  {item.claimedAt
                    ? formatDateTime(item.claimedAt)
                    : 'Not recorded'}
                </dd>
              </div>
              <div>
                <dt>Claimed by</dt>
                <dd>{item.claimedByName || 'Not recorded'}</dd>
              </div>
              <div>
                <dt>Processed by</dt>
                <dd>{item.claimProcessedBy?.username || 'Not recorded'}</dd>
              </div>
              <div>
                <dt>Claim notes</dt>
                <dd>{item.claimNotes || 'None'}</dd>
              </div>
            </>
          )}
          {item.status === 'DISPOSED' && (
            <>
              <div>
                <dt>Disposed</dt>
                <dd>
                  {item.disposedAt
                    ? formatDateTime(item.disposedAt)
                    : 'Not recorded'}
                </dd>
              </div>
              <div>
                <dt>Processed by</dt>
                <dd>{item.disposedBy?.username || 'Not recorded'}</dd>
              </div>
              <div>
                <dt>Reason</dt>
                <dd>{item.disposalNotes || 'Not recorded'}</dd>
              </div>
            </>
          )}
        </dl>
        <div className="dialog-actions lost-found-detail-actions">
          {role === 'OWNER' && item.status === 'UNCLAIMED' && (
            <button className="danger-button" type="button" onClick={onDelete}>
              <Trash2 size={16} />
              Delete
            </button>
          )}
          {canEdit && (
            <button className="secondary-button" type="button" onClick={onEdit}>
              <Pencil size={16} />
              Edit
            </button>
          )}
          {item.status === 'UNCLAIMED' && (
            <button
              className="secondary-button"
              type="button"
              onClick={onClaim}
            >
              <CheckCircle2 size={16} />
              Mark claimed
            </button>
          )}
          {role === 'OWNER' && item.status === 'UNCLAIMED' && (
            <button
              className="secondary-button"
              type="button"
              onClick={onDispose}
            >
              Dispose
            </button>
          )}
          <button className="primary-button" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </section>
    </div>
  );
}

function ProcessDialog({
  title,
  kind,
  onClose,
  onSubmit,
}: {
  title: string;
  kind: 'claim' | 'dispose';
  onClose: () => void;
  onSubmit: (values: { name: string; notes: string }) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await onSubmit({ name, notes });
    } catch (error: unknown) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'The status could not be updated.',
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="process-title"
      >
        <div className="dialog-header">
          <h2 id="process-title">{title}</h2>
          <button
            className="icon-button"
            type="button"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <form onSubmit={(event) => void submit(event)}>
          {kind === 'claim' && (
            <label>
              Claimed by <span className="optional-label">Optional</span>
              <input
                maxLength={100}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
          )}
          <label>
            {kind === 'claim' ? 'Claim notes' : 'Disposal reason'}
            <textarea
              required={kind === 'dispose'}
              maxLength={1000}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>
          {message && (
            <p className="form-error" role="alert">
              {message}
            </p>
          )}
          <div className="dialog-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
            >
              Cancel
            </button>
            <button className="primary-button" disabled={saving}>
              {saving
                ? 'Saving...'
                : kind === 'claim'
                  ? 'Confirm claimed'
                  : 'Confirm disposal'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
