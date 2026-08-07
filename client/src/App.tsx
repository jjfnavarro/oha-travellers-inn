import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { getOccupancyStatus, type OccupancyStatus } from './stay-status';

type OperationalStatus = 'ACTIVE' | 'MAINTENANCE' | 'INACTIVE';
type View = 'rooms' | 'rates';
type RoomFilter = 'ALL' | OccupancyStatus | 'MAINTENANCE' | 'INACTIVE';

interface Rate {
  id: number;
  durationHours: number;
  amountCentavos: number;
}

interface RoomType {
  id: number;
  name: string;
  description: string | null;
  rates: Rate[];
  _count?: { rooms: number };
}

interface Room {
  id: number;
  number: string;
  displayOrder: number;
  operationalStatus: OperationalStatus;
  roomTypeId: number;
  roomType: RoomType;
  stays: Stay[];
}

interface Stay {
  id: number;
  roomId: number;
  arrivalType: 'VEHICLE' | 'WALK_IN';
  guestName: string | null;
  plateNumber: string | null;
  durationHours: number;
  paidAmountCentavos: number;
  checkedInAt: string;
  expectedCheckoutAt: string;
}

interface ApiCollection<T> {
  data: T[];
}

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api';
const durations = [3, 6, 12, 24] as const;

async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  });
  const body: unknown = await response.json();
  if (!response.ok) {
    const message =
      typeof body === 'object' && body !== null && 'message' in body
        ? String(body.message)
        : 'The request could not be completed.';
    throw new Error(message);
  }
  return body as T;
}

function formatMoney(centavos: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 0,
  }).format(centavos / 100);
}

function statusLabel(status: OperationalStatus): string {
  if (status === 'ACTIVE') return 'Available';
  if (status === 'INACTIVE') return 'Out of service';
  return status.charAt(0) + status.slice(1).toLowerCase();
}

function occupancyLabel(status: OccupancyStatus): string {
  if (status === 'DUE_SOON') return 'Checkout soon';
  return status.charAt(0) + status.slice(1).toLowerCase();
}

function formatRemaining(stay: Stay, now: number): string {
  const difference = new Date(stay.expectedCheckoutAt).getTime() - now;
  const absoluteSeconds = Math.max(0, Math.floor(Math.abs(difference) / 1000));
  const hours = Math.floor(absoluteSeconds / 3600);
  const minutes = Math.floor((absoluteSeconds % 3600) / 60);
  const seconds = absoluteSeconds % 60;
  const clock = `${hours > 0 ? `${hours}h ` : ''}${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
  return difference < 0 ? `${clock} overdue` : `${clock} remaining`;
}

export default function App() {
  const [view, setView] = useState<View>('rooms');
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [filter, setFilter] = useState<RoomFilter>('ALL');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddRoom, setShowAddRoom] = useState(false);
  const [checkInRoom, setCheckInRoom] = useState<Room | null>(null);
  const [now, setNow] = useState(Date.now());
  const [soundEnabled, setSoundEnabled] = useState(false);
  const warnedStayIds = useRef(new Set<number>());
  const lastOverdueAlert = useRef(new Map<number, number>());

  async function loadInventory(): Promise<void> {
    setError(null);
    try {
      await apiRequest('/health');
      const [roomResponse, typeResponse] = await Promise.all([
        apiRequest<ApiCollection<Room>>('/rooms'),
        apiRequest<ApiCollection<RoomType>>('/room-types'),
      ]);
      setRooms(roomResponse.data);
      setRoomTypes(typeResponse.data);
    } catch (requestError: unknown) {
      const detail =
        requestError instanceof Error
          ? requestError.message
          : 'Unknown connection error.';
      setError(`System unavailable. ${detail}`);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadInventory();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  function playAlert(): void {
    const AudioContextClass = window.AudioContext;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 740;
    gain.gain.setValueAtTime(0.12, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.35);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.35);
    oscillator.addEventListener('ended', () => void context.close());
  }

  useEffect(() => {
    if (!soundEnabled) return;
    for (const room of rooms) {
      const stay = room.stays[0];
      if (!stay) continue;
      const occupancy = getOccupancyStatus(stay, now);
      if (occupancy === 'DUE_SOON' && !warnedStayIds.current.has(stay.id)) {
        warnedStayIds.current.add(stay.id);
        playAlert();
      }
      if (occupancy === 'OVERDUE') {
        const lastAlert = lastOverdueAlert.current.get(stay.id) ?? 0;
        if (now - lastAlert >= 60_000) {
          lastOverdueAlert.current.set(stay.id, now);
          playAlert();
        }
      }
    }
  }, [now, rooms, soundEnabled]);

  const visibleRooms = useMemo(
    () =>
      rooms.filter((room) => {
        if (filter === 'ALL') return true;
        if (filter === 'MAINTENANCE' || filter === 'INACTIVE')
          return room.operationalStatus === filter;
        return (
          room.operationalStatus === 'ACTIVE' &&
          getOccupancyStatus(room.stays[0], now) === filter
        );
      }),
    [filter, now, rooms],
  );

  async function checkOut(stay: Stay): Promise<void> {
    if (
      !window.confirm(
        'Check out this room now? The paid amount will remain unchanged.',
      )
    )
      return;
    setError(null);
    try {
      await apiRequest(`/stays/${stay.id}/check-out`, { method: 'POST' });
      await loadInventory();
    } catch (requestError: unknown) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Checkout could not be completed.',
      );
    }
  }

  async function changeRoomStatus(
    room: Room,
    operationalStatus: OperationalStatus,
  ): Promise<void> {
    setError(null);
    try {
      const response = await apiRequest<{ data: Room }>(`/rooms/${room.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ operationalStatus }),
      });
      setRooms((current) =>
        current.map((item) => (item.id === room.id ? response.data : item)),
      );
    } catch (requestError: unknown) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Room status could not be updated.',
      );
    }
  }

  if (isLoading) {
    return <main className="center-state">Checking system connection...</main>;
  }

  if (error && rooms.length === 0) {
    return (
      <main className="center-state">
        <h1>OHA Traveller's Inn</h1>
        <p className="error-message">{error}</p>
        <button
          type="button"
          className="primary-button"
          onClick={() => void loadInventory()}
        >
          Try again
        </button>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand-lockup">
          <img
            className="brand-logo"
            src="/oha-logo.jpg"
            alt="OHA Traveller's Inn logo"
          />
          <div>
            <p className="eyebrow">Front Desk System</p>
            <h1>OHA Traveller's Inn</h1>
          </div>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="sound-button"
            onClick={() => {
              if (!soundEnabled) playAlert();
              setSoundEnabled((enabled) => !enabled);
            }}
          >
            {soundEnabled ? 'Sound on' : 'Enable sound'}
          </button>
          <div className="connection">
            <span aria-hidden="true" />
            System Connected
          </div>
        </div>
      </header>

      <nav className="tabs" aria-label="Main navigation">
        <button
          className={view === 'rooms' ? 'active' : ''}
          onClick={() => setView('rooms')}
        >
          Rooms
        </button>
        <button
          className={view === 'rates' ? 'active' : ''}
          onClick={() => setView('rates')}
        >
          Rates
        </button>
      </nav>

      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}

      <main className="content">
        {view === 'rooms' ? (
          <>
            <div className="page-heading">
              <div>
                <h2>Room inventory</h2>
                <p>{rooms.length} rooms configured</p>
              </div>
              <button
                type="button"
                className="primary-button"
                onClick={() => setShowAddRoom(true)}
              >
                + Add room
              </button>
            </div>

            <div className="filter-bar" aria-label="Filter rooms">
              {(
                [
                  'ALL',
                  'VACANT',
                  'OCCUPIED',
                  'DUE_SOON',
                  'OVERDUE',
                  'MAINTENANCE',
                  'INACTIVE',
                ] as const
              ).map((status) => (
                <button
                  key={status}
                  className={filter === status ? 'active' : ''}
                  onClick={() => setFilter(status)}
                >
                  {status === 'ALL'
                    ? 'All'
                    : status === 'MAINTENANCE' || status === 'INACTIVE'
                      ? statusLabel(status)
                      : occupancyLabel(status)}
                </button>
              ))}
            </div>

            {visibleRooms.length === 0 ? (
              <p className="empty-state">No rooms match this filter.</p>
            ) : (
              <div className="room-grid">
                {visibleRooms.map((room) => {
                  const stay = room.stays[0];
                  const occupancy = getOccupancyStatus(stay, now);
                  return (
                    <article
                      className={`room-card ${occupancy.toLowerCase()}`}
                      key={room.id}
                    >
                      <div className="room-card-top">
                        <span>Room</span>
                        <strong>{room.number}</strong>
                      </div>
                      <p className="room-type">{room.roomType.name}</p>
                      {room.operationalStatus === 'ACTIVE' && (
                        <div className="occupancy-control">
                          <span
                            className={`occupancy-badge ${occupancy.toLowerCase()}`}
                          >
                            {occupancyLabel(occupancy)}
                          </span>
                          {stay ? (
                            <>
                              <strong className="timer">
                                {formatRemaining(stay, now)}
                              </strong>
                              <small>
                                {stay.durationHours} hours ·{' '}
                                {formatMoney(stay.paidAmountCentavos)} paid
                              </small>
                              <button
                                className="secondary-button room-action"
                                onClick={() => void checkOut(stay)}
                              >
                                Check out
                              </button>
                            </>
                          ) : (
                            <button
                              className="primary-button room-action"
                              onClick={() => setCheckInRoom(room)}
                            >
                              Check in
                            </button>
                          )}
                        </div>
                      )}
                      <label className="status-control">
                        <span>
                          Operational status{stay ? ' · checkout first' : ''}
                        </span>
                        <select
                          aria-label={`Operational status for room ${room.number}`}
                          className={`status-select ${room.operationalStatus.toLowerCase()}`}
                          value={room.operationalStatus}
                          disabled={Boolean(stay)}
                          onChange={(event) =>
                            void changeRoomStatus(
                              room,
                              event.target.value as OperationalStatus,
                            )
                          }
                        >
                          <option value="ACTIVE">Available</option>
                          <option value="MAINTENANCE">Maintenance</option>
                          <option value="INACTIVE">Out of service</option>
                        </select>
                      </label>
                    </article>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <RatesView
            roomTypes={roomTypes}
            onUpdated={loadInventory}
            setError={setError}
          />
        )}
      </main>

      {showAddRoom && (
        <AddRoomDialog
          roomTypes={roomTypes}
          nextOrder={Math.max(0, ...rooms.map((room) => room.displayOrder)) + 1}
          onClose={() => setShowAddRoom(false)}
          onCreated={(room) => {
            setRooms((current) =>
              [...current, room].sort(
                (a, b) => a.displayOrder - b.displayOrder,
              ),
            );
            setShowAddRoom(false);
          }}
        />
      )}
      {checkInRoom && (
        <CheckInDialog
          room={checkInRoom}
          onClose={() => setCheckInRoom(null)}
          onCheckedIn={async () => {
            setCheckInRoom(null);
            await loadInventory();
          }}
        />
      )}
    </div>
  );
}

function RatesView({
  roomTypes,
  onUpdated,
  setError,
}: {
  roomTypes: RoomType[];
  onUpdated: () => Promise<void>;
  setError: (message: string | null) => void;
}) {
  const [drafts, setDrafts] = useState<Record<number, Record<number, string>>>(
    () =>
      Object.fromEntries(
        roomTypes.map((type) => [
          type.id,
          Object.fromEntries(
            type.rates.map((rate) => [
              rate.durationHours,
              String(rate.amountCentavos / 100),
            ]),
          ),
        ]),
      ),
  );
  const [savingId, setSavingId] = useState<number | null>(null);

  async function saveRates(roomType: RoomType): Promise<void> {
    const draft = drafts[roomType.id] ?? {};
    const rates = durations.flatMap((durationHours) => {
      const amount = Number(draft[durationHours]);
      return Number.isFinite(amount) && amount > 0
        ? [{ durationHours, amountCentavos: Math.round(amount * 100) }]
        : [];
    });
    if (rates.length === 0) {
      setError('Each room type must offer at least one rate.');
      return;
    }
    setSavingId(roomType.id);
    setError(null);
    try {
      await apiRequest(`/room-types/${roomType.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: roomType.name,
          description: roomType.description,
          rates,
        }),
      });
      await onUpdated();
    } catch (requestError: unknown) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Rates could not be saved.',
      );
    } finally {
      setSavingId(null);
    }
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <h2>Stay rates</h2>
          <p>Leave a duration blank when it is not offered.</p>
        </div>
      </div>
      <div className="rate-table-wrap">
        <table className="rate-table">
          <thead>
            <tr>
              <th>Room type</th>
              {durations.map((duration) => (
                <th key={duration}>{duration} hours</th>
              ))}
              <th>
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {roomTypes.map((roomType) => (
              <tr key={roomType.id}>
                <th>
                  <strong>{roomType.name}</strong>
                  <span>{roomType._count?.rooms ?? 0} rooms</span>
                </th>
                {durations.map((duration) => (
                  <td key={duration}>
                    <label>
                      <span>₱</span>
                      <input
                        aria-label={`${roomType.name} ${duration}-hour rate`}
                        type="number"
                        min="1"
                        step="1"
                        placeholder="Not offered"
                        value={drafts[roomType.id]?.[duration] ?? ''}
                        onChange={(event) =>
                          setDrafts((current) => ({
                            ...current,
                            [roomType.id]: {
                              ...current[roomType.id],
                              [duration]: event.target.value,
                            },
                          }))
                        }
                      />
                    </label>
                  </td>
                ))}
                <td>
                  <button
                    className="secondary-button"
                    disabled={savingId === roomType.id}
                    onClick={() => void saveRates(roomType)}
                  >
                    {savingId === roomType.id ? 'Saving...' : 'Save'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="rate-summary">
        {roomTypes.map((type) => (
          <p key={type.id}>
            <strong>{type.name}:</strong>{' '}
            {type.rates
              .map(
                (rate) =>
                  `${rate.durationHours}h ${formatMoney(rate.amountCentavos)}`,
              )
              .join(' · ')}
          </p>
        ))}
      </div>
    </>
  );
}

function CheckInDialog({
  room,
  onClose,
  onCheckedIn,
}: {
  room: Room;
  onClose: () => void;
  onCheckedIn: () => Promise<void>;
}) {
  const [durationHours, setDurationHours] = useState(
    String(room.roomType.rates[0]?.durationHours ?? ''),
  );
  const [arrivalType, setArrivalType] = useState<'VEHICLE' | 'WALK_IN'>(
    'VEHICLE',
  );
  const [guestName, setGuestName] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const selectedRate = room.roomType.rates.find(
    (rate) => rate.durationHours === Number(durationHours),
  );

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await apiRequest('/stays/check-in', {
        method: 'POST',
        body: JSON.stringify({
          roomId: room.id,
          durationHours: Number(durationHours),
          arrivalType,
          guestName,
          plateNumber: arrivalType === 'VEHICLE' ? plateNumber : null,
          notes,
        }),
      });
      await onCheckedIn();
    } catch (requestError: unknown) {
      setMessage(
        requestError instanceof Error
          ? requestError.message
          : 'Check-in could not be completed.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="dialog check-in-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="check-in-title"
      >
        <div className="dialog-header">
          <div>
            <p className="dialog-eyebrow">Room {room.number}</p>
            <h2 id="check-in-title">Guest check-in</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label="Close"
            title="Close"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <form onSubmit={(event) => void submit(event)}>
          <fieldset className="segmented-field">
            <legend>Arrival</legend>
            <div>
              <button
                type="button"
                className={arrivalType === 'VEHICLE' ? 'active' : ''}
                onClick={() => setArrivalType('VEHICLE')}
              >
                Vehicle
              </button>
              <button
                type="button"
                className={arrivalType === 'WALK_IN' ? 'active' : ''}
                onClick={() => setArrivalType('WALK_IN')}
              >
                Walk-in
              </button>
            </div>
          </fieldset>
          <label>
            Stay duration
            <select
              required
              value={durationHours}
              onChange={(event) => setDurationHours(event.target.value)}
            >
              {room.roomType.rates.map((rate) => (
                <option key={rate.id} value={rate.durationHours}>
                  {rate.durationHours} hours ·{' '}
                  {formatMoney(rate.amountCentavos)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Guest name <span className="optional">Optional</span>
            <input
              maxLength={100}
              value={guestName}
              onChange={(event) => setGuestName(event.target.value)}
            />
          </label>
          {arrivalType === 'VEHICLE' && (
            <label>
              Plate number <span className="optional">Optional</span>
              <input
                maxLength={30}
                value={plateNumber}
                onChange={(event) =>
                  setPlateNumber(event.target.value.toUpperCase())
                }
              />
            </label>
          )}
          <label>
            Notes <span className="optional">Optional</span>
            <textarea
              maxLength={500}
              rows={2}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>
          <div className="payment-summary">
            <span>Payment at check-in</span>
            <strong>
              {selectedRate
                ? formatMoney(selectedRate.amountCentavos)
                : 'Select a rate'}
            </strong>
            <small>Early checkout does not change this amount.</small>
          </div>
          {message && <p className="form-error">{message}</p>}
          <div className="dialog-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="primary-button"
              disabled={saving || !selectedRate}
            >
              {saving ? 'Checking in...' : 'Confirm check-in'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function AddRoomDialog({
  roomTypes,
  nextOrder,
  onClose,
  onCreated,
}: {
  roomTypes: RoomType[];
  nextOrder: number;
  onClose: () => void;
  onCreated: (room: Room) => void;
}) {
  const [number, setNumber] = useState('');
  const [roomTypeId, setRoomTypeId] = useState(String(roomTypes[0]?.id ?? ''));
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const response = await apiRequest<{ data: Room }>('/rooms', {
        method: 'POST',
        body: JSON.stringify({
          number,
          roomTypeId: Number(roomTypeId),
          displayOrder: nextOrder,
          operationalStatus: 'ACTIVE',
        }),
      });
      onCreated(response.data);
    } catch (requestError: unknown) {
      setMessage(
        requestError instanceof Error
          ? requestError.message
          : 'Room could not be added.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-room-title"
      >
        <div className="dialog-header">
          <h2 id="add-room-title">Add room</h2>
          <button
            className="icon-button"
            type="button"
            aria-label="Close"
            title="Close"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <form onSubmit={(event) => void submit(event)}>
          <label>
            Room number
            <input
              autoFocus
              required
              maxLength={10}
              value={number}
              onChange={(event) => setNumber(event.target.value)}
            />
          </label>
          <label>
            Room type
            <select
              value={roomTypeId}
              onChange={(event) => setRoomTypeId(event.target.value)}
            >
              {roomTypes.map((type) => (
                <option value={type.id} key={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
          </label>
          {message && <p className="form-error">{message}</p>}
          <div className="dialog-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
            >
              Cancel
            </button>
            <button type="submit" className="primary-button" disabled={saving}>
              {saving ? 'Adding...' : 'Add room'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
