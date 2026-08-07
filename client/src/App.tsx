import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  BadgeDollarSign,
  BedDouble,
  ChartNoAxesCombined,
  ClipboardList,
  Clock3,
  History,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Users,
} from 'lucide-react';
import { getOccupancyStatus, type OccupancyStatus } from './stay-status';

type OperationalStatus = 'ACTIVE' | 'MAINTENANCE' | 'INACTIVE';
type View =
  'rooms' | 'history' | 'reports' | 'shifts' | 'rates' | 'staff' | 'audit';
type StaffRole = 'OWNER' | 'FRONT_DESK';

interface StaffUser {
  id: number;
  username: string;
  role: StaffRole;
}
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
  extensions: StayExtension[];
}

interface StayExtension {
  id: number;
  durationHours: number;
  amountCentavos: number;
  paymentMethod: 'CASH' | 'GCASH' | 'UNKNOWN';
  createdAt: string;
}

interface HistoryStay extends Stay {
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  checkedOutAt: string | null;
  room: Room;
  shift: { type: 'DAY' | 'NIGHT' } | null;
  checkedInBy: { id: number; username: string } | null;
  checkedOutBy: { id: number; username: string } | null;
}

interface ApiCollection<T> {
  data: T[];
}

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api';
const durations = [3, 6, 12, 24] as const;

async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  });
  const body: unknown =
    response.status === 204 ? undefined : await response.json();
  if (!response.ok) {
    const message =
      typeof body === 'object' && body !== null && 'message' in body
        ? String(body.message)
        : 'The request could not be completed.';
    if (response.status === 401 && path !== '/auth/login') {
      window.dispatchEvent(new Event('oha:unauthorized'));
    }
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
  const [authChecking, setAuthChecking] = useState(true);
  const [user, setUser] = useState<StaffUser | null>(null);
  const [view, setView] = useState<View>('rooms');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const stored = window.localStorage.getItem('oha-sidebar-collapsed');
    return stored === null ? window.innerWidth <= 1024 : stored === 'true';
  });
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [filter, setFilter] = useState<RoomFilter>('ALL');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddRoom, setShowAddRoom] = useState(false);
  const [checkInRoom, setCheckInRoom] = useState<Room | null>(null);
  const [extendRoom, setExtendRoom] = useState<Room | null>(null);
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
    apiRequest<{ data: StaffUser }>('/auth/me')
      .then((response) => setUser(response.data))
      .catch(() => setUser(null))
      .finally(() => setAuthChecking(false));
    const unauthorized = () => setUser(null);
    window.addEventListener('oha:unauthorized', unauthorized);
    return () => window.removeEventListener('oha:unauthorized', unauthorized);
  }, []);

  useEffect(() => {
    if (user) void loadInventory();
  }, [user]);

  useEffect(() => {
    window.localStorage.setItem(
      'oha-sidebar-collapsed',
      String(sidebarCollapsed),
    );
  }, [sidebarCollapsed]);

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

  function selectView(nextView: View): void {
    setView(nextView);
    if (window.innerWidth <= 1024) setSidebarCollapsed(true);
  }

  if (authChecking) {
    return <main className="center-state">Checking secure session...</main>;
  }

  if (!user) {
    return <LoginScreen onLogin={setUser} />;
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
    <div className={`app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <header className="app-header">
        <div className="brand-lockup">
          <button
            className="sidebar-trigger"
            type="button"
            aria-label="Open sidebar"
            title="Open sidebar"
            onClick={() => setSidebarCollapsed(false)}
          >
            <PanelLeftOpen size={20} />
          </button>
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
          <div className="user-menu">
            <strong>{user.username}</strong>
            <span>{user.role === 'OWNER' ? 'Owner' : 'Front desk'}</span>
          </div>
          <button
            className="logout-button"
            type="button"
            onClick={() =>
              void apiRequest('/auth/logout', { method: 'POST' }).finally(() =>
                setUser(null),
              )
            }
          >
            Log out
          </button>
        </div>
      </header>

      <nav className="tabs" aria-label="Main navigation">
        <div className="sidebar-heading">
          <span>Navigation</span>
          <button
            type="button"
            aria-label="Hide sidebar"
            title="Hide sidebar"
            onClick={() => setSidebarCollapsed(true)}
          >
            <PanelLeftClose size={19} />
          </button>
        </div>
        <button
          className={view === 'rooms' ? 'active' : ''}
          onClick={() => selectView('rooms')}
          title="Rooms"
        >
          <BedDouble size={20} />
          <span>Rooms</span>
        </button>
        <button
          className={view === 'history' ? 'active' : ''}
          onClick={() => selectView('history')}
          title="Stay history"
        >
          <History size={20} />
          <span>Stay history</span>
        </button>
        {user.role === 'OWNER' && (
          <button
            className={view === 'reports' ? 'active' : ''}
            onClick={() => selectView('reports')}
            title="Reports"
          >
            <ChartNoAxesCombined size={20} />
            <span>Reports</span>
          </button>
        )}
        {user.role === 'OWNER' && (
          <button
            className={view === 'audit' ? 'active' : ''}
            onClick={() => selectView('audit')}
            title="Audit"
          >
            <ClipboardList size={20} />
            <span>Audit</span>
          </button>
        )}
        <button
          className={view === 'shifts' ? 'active' : ''}
          onClick={() => selectView('shifts')}
          title="Shifts"
        >
          <Clock3 size={20} />
          <span>Shifts</span>
        </button>
        {user.role === 'OWNER' && (
          <button
            className={view === 'rates' ? 'active' : ''}
            onClick={() => selectView('rates')}
            title="Rates"
          >
            <BadgeDollarSign size={20} />
            <span>Rates</span>
          </button>
        )}
        {user.role === 'OWNER' && (
          <button
            className={view === 'staff' ? 'active' : ''}
            onClick={() => selectView('staff')}
            title="Staff"
          >
            <Users size={20} />
            <span>Staff</span>
          </button>
        )}
      </nav>
      {!sidebarCollapsed && (
        <button
          className="sidebar-scrim"
          type="button"
          aria-label="Close sidebar"
          onClick={() => setSidebarCollapsed(true)}
        />
      )}

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
              {user.role === 'OWNER' && (
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => setShowAddRoom(true)}
                >
                  + Add room
                </button>
              )}
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
                      className={`room-card ${
                        room.operationalStatus === 'ACTIVE'
                          ? occupancy.toLowerCase()
                          : room.operationalStatus.toLowerCase()
                      }`}
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
                                {stay.durationHours +
                                  stay.extensions.reduce(
                                    (total, extension) =>
                                      total + extension.durationHours,
                                    0,
                                  )}{' '}
                                hours total ·{' '}
                                {formatMoney(stay.paidAmountCentavos)} paid
                              </small>
                              <div className="room-actions">
                                <button
                                  className="secondary-button room-action"
                                  onClick={() => setExtendRoom(room)}
                                >
                                  <Clock3 size={15} aria-hidden="true" />
                                  Extend
                                </button>
                                <button
                                  className="secondary-button room-action"
                                  onClick={() => void checkOut(stay)}
                                >
                                  <LogOut size={15} aria-hidden="true" />
                                  Check out
                                </button>
                              </div>
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
        ) : view === 'rates' ? (
          <RatesView
            roomTypes={roomTypes}
            onUpdated={loadInventory}
            setError={setError}
          />
        ) : view === 'history' ? (
          <HistoryView rooms={rooms} roomTypes={roomTypes} />
        ) : view === 'reports' ? (
          <ReportsView />
        ) : view === 'shifts' ? (
          <ShiftsView />
        ) : view === 'staff' ? (
          <StaffView currentUserId={user.id} />
        ) : (
          <AuditView />
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
      {extendRoom?.stays[0] && (
        <ExtendStayDialog
          room={extendRoom}
          stay={extendRoom.stays[0]}
          onClose={() => setExtendRoom(null)}
          onExtended={async () => {
            setExtendRoom(null);
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

function LoginScreen({ onLogin }: { onLogin: (user: StaffUser) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);
    try {
      const response = await apiRequest<{ data: StaffUser }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      onLogin(response.data);
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : 'Login failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-panel">
        <img src="/oha-logo.jpg" alt="OHA Traveller's Inn logo" />
        <p className="eyebrow">Front Desk System</p>
        <h1>Staff login</h1>
        <form onSubmit={(event) => void submit(event)}>
          <label>
            Username
            <input
              autoComplete="username"
              autoCapitalize="none"
              required
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {message && (
            <p className="form-error" role="alert">
              {message}
            </p>
          )}
          <button className="primary-button" disabled={submitting}>
            {submitting ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </section>
    </main>
  );
}

interface StaffRecord extends StaffUser {
  isActive: boolean;
  createdAt: string;
}

function StaffView({ currentUserId }: { currentUserId: number }) {
  const [staff, setStaff] = useState<StaffRecord[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [passwords, setPasswords] = useState<Record<number, string>>({});

  async function load(): Promise<void> {
    try {
      const response = await apiRequest<ApiCollection<StaffRecord>>('/staff');
      setStaff(response.data);
    } catch (error: unknown) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Staff accounts could not be loaded.',
      );
    }
  }
  useEffect(() => {
    void load();
  }, []);

  async function update(
    id: number,
    data: { isActive?: boolean; password?: string },
  ): Promise<void> {
    setMessage(null);
    try {
      await apiRequest(`/staff/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
      setPasswords((current) => ({ ...current, [id]: '' }));
      await load();
    } catch (error: unknown) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Account could not be updated.',
      );
    }
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <h2>Staff accounts</h2>
          <p>Owner-only account management</p>
        </div>
      </div>
      {message && <p className="form-error">{message}</p>}
      <div className="staff-list">
        {staff.map((account) => (
          <article className="staff-row" key={account.id}>
            <div>
              <strong>{account.username}</strong>
              <span>
                {account.role === 'OWNER' ? 'Owner' : 'Front desk'} ·{' '}
                {account.isActive ? 'Active' : 'Disabled'}
              </span>
            </div>
            <label>
              New password
              <input
                type="password"
                minLength={8}
                placeholder="At least 8 characters"
                value={passwords[account.id] ?? ''}
                onChange={(event) =>
                  setPasswords((current) => ({
                    ...current,
                    [account.id]: event.target.value,
                  }))
                }
              />
            </label>
            <button
              className="secondary-button"
              disabled={(passwords[account.id]?.length ?? 0) < 8}
              onClick={() =>
                void update(account.id, { password: passwords[account.id] })
              }
            >
              Update password
            </button>
            <button
              className="secondary-button"
              disabled={account.id === currentUserId}
              onClick={() =>
                void update(account.id, { isActive: !account.isActive })
              }
            >
              {account.isActive ? 'Disable' : 'Enable'}
            </button>
          </article>
        ))}
      </div>
    </>
  );
}

interface AuditRecord {
  id: number;
  action: string;
  entityType: string;
  entityId: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
  staff: { username: string } | null;
}

function AuditView() {
  const [logs, setLogs] = useState<AuditRecord[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    apiRequest<ApiCollection<AuditRecord>>('/audit')
      .then((response) => setLogs(response.data))
      .catch((error: unknown) =>
        setMessage(
          error instanceof Error
            ? error.message
            : 'Audit history could not be loaded.',
        ),
      );
  }, []);
  return (
    <>
      <div className="page-heading">
        <div>
          <h2>Audit history</h2>
          <p>500 most recent security and operational actions</p>
        </div>
      </div>
      {message && <p className="form-error">{message}</p>}
      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Employee</th>
              <th>Action</th>
              <th>Record</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id}>
                <td>{formatDateTime(log.createdAt)}</td>
                <td>{log.staff?.username ?? 'System'}</td>
                <td>{log.action.replaceAll('_', ' ')}</td>
                <td>
                  {log.entityType}
                  {log.entityId ? ` #${log.entityId}` : ''}
                </td>
                <td>
                  <small>
                    {log.details ? JSON.stringify(log.details) : '—'}
                  </small>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function formatDateTime(value: string | Date): string {
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function checkoutResult(stay: HistoryStay): string {
  if (!stay.checkedOutAt)
    return stay.status === 'ACTIVE' ? 'Active' : stay.status;
  const difference =
    new Date(stay.checkedOutAt).getTime() -
    new Date(stay.expectedCheckoutAt).getTime();
  if (difference < 0) return 'Early';
  if (difference > 0) return 'Overdue';
  return 'On time';
}

function HistoryView({
  rooms,
  roomTypes,
}: {
  rooms: Room[];
  roomTypes: RoomType[];
}) {
  const [stays, setStays] = useState<HistoryStay[]>([]);
  const [status, setStatus] = useState('ALL');
  const [arrival, setArrival] = useState('ALL');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [roomId, setRoomId] = useState('ALL');
  const [roomTypeId, setRoomTypeId] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const parameters = new URLSearchParams();
    if (status !== 'ALL') parameters.set('status', status);
    if (arrival !== 'ALL') parameters.set('arrivalType', arrival);
    if (from)
      parameters.set('from', new Date(`${from}T00:00:00+08:00`).toISOString());
    if (to)
      parameters.set('to', new Date(`${to}T23:59:59.999+08:00`).toISOString());
    if (roomId !== 'ALL') parameters.set('roomId', roomId);
    if (roomTypeId !== 'ALL') parameters.set('roomTypeId', roomTypeId);
    setLoading(true);
    apiRequest<ApiCollection<HistoryStay>>(`/stays/history?${parameters}`)
      .then((response) => setStays(response.data))
      .catch((error: unknown) =>
        setMessage(
          error instanceof Error
            ? error.message
            : 'History could not be loaded.',
        ),
      )
      .finally(() => setLoading(false));
  }, [arrival, from, roomId, roomTypeId, status, to]);

  return (
    <>
      <div className="page-heading">
        <div>
          <h2>Stay history</h2>
          <p>Up to 500 recent check-ins</p>
        </div>
      </div>
      <div className="report-controls">
        <label>
          Status
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="ALL">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </label>
        <label>
          Arrival
          <select
            value={arrival}
            onChange={(event) => setArrival(event.target.value)}
          >
            <option value="ALL">All arrivals</option>
            <option value="VEHICLE">Vehicle</option>
            <option value="WALK_IN">Walk-in</option>
          </select>
        </label>
        <label>
          From
          <input
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
        </label>
        <label>
          To
          <input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(event) => setTo(event.target.value)}
          />
        </label>
        <label>
          Room type
          <select
            value={roomTypeId}
            onChange={(event) => setRoomTypeId(event.target.value)}
          >
            <option value="ALL">All room types</option>
            {roomTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Room
          <select
            value={roomId}
            onChange={(event) => setRoomId(event.target.value)}
          >
            <option value="ALL">All rooms</option>
            {rooms
              .filter(
                (room) =>
                  roomTypeId === 'ALL' ||
                  room.roomTypeId === Number(roomTypeId),
              )
              .map((room) => (
                <option key={room.id} value={room.id}>
                  Room {room.number}
                </option>
              ))}
          </select>
        </label>
      </div>
      {message && <p className="form-error">{message}</p>}
      {loading ? (
        <p className="empty-state">Loading history...</p>
      ) : stays.length === 0 ? (
        <p className="empty-state">No stays match these filters.</p>
      ) : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Room</th>
                <th>Check-in</th>
                <th>Checkout</th>
                <th>Stay</th>
                <th>Arrival</th>
                <th>Paid</th>
                <th>Employees</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {stays.map((stay) => (
                <tr key={stay.id}>
                  <td>
                    <strong>{stay.room.number}</strong>
                    <small>{stay.room.roomType.name}</small>
                  </td>
                  <td>{formatDateTime(stay.checkedInAt)}</td>
                  <td>
                    {stay.checkedOutAt
                      ? formatDateTime(stay.checkedOutAt)
                      : 'Active'}
                  </td>
                  <td>
                    {stay.durationHours} hours
                    <small>{stay.shift?.type ?? ''} shift</small>
                  </td>
                  <td>
                    {stay.arrivalType === 'WALK_IN' ? 'Walk-in' : 'Vehicle'}
                    <small>{stay.plateNumber ?? stay.guestName ?? ''}</small>
                  </td>
                  <td>{formatMoney(stay.paidAmountCentavos)}</td>
                  <td>
                    <small>
                      In: {stay.checkedInBy?.username ?? 'Legacy record'}
                    </small>
                    <small>Out: {stay.checkedOutBy?.username ?? '—'}</small>
                  </td>
                  <td>
                    <span className="table-status">{checkoutResult(stay)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

interface DailyReportResponse {
  date: string;
  summary: {
    totalStays: number;
    totalAmountCentavos: number;
    activeStays: number;
    vehicleStays: number;
    walkInStays: number;
    earlyCheckouts: number;
    overdueCheckouts: number;
  };
  byRoomType: { roomType: string; stays: number; amountCentavos: number }[];
  stays: HistoryStay[];
}

function manilaOperationalDate(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  const date = new Date(
    `${value('year')}-${value('month')}-${value('day')}T00:00:00+08:00`,
  );
  if (Number(value('hour')) < 8) date.setDate(date.getDate() - 1);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function ReportsView() {
  const [date, setDate] = useState(manilaOperationalDate);
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('day');
  const [report, setReport] = useState<DailyReportResponse | null>(null);
  const [statistics, setStatistics] = useState<{
    totalStays: number;
    totalAmountCentavos: number;
    vehicleStays: number;
    walkInStays: number;
  } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    apiRequest<{ data: DailyReportResponse }>(`/reports/daily?date=${date}`)
      .then((response) => {
        setReport(response.data);
        setMessage(null);
      })
      .catch((error: unknown) =>
        setMessage(
          error instanceof Error
            ? error.message
            : 'Report could not be loaded.',
        ),
      );
  }, [date]);
  useEffect(() => {
    apiRequest<{ data: NonNullable<typeof statistics> }>(
      `/reports/statistics?date=${date}&period=${period}`,
    )
      .then((response) => setStatistics(response.data))
      .catch((error: unknown) =>
        setMessage(
          error instanceof Error
            ? error.message
            : 'Statistics could not be loaded.',
        ),
      );
  }, [date, period]);
  const download = (extension: 'pdf' | 'xlsx') => {
    window.location.href = `${apiUrl}/reports/daily.${extension}?date=${date}`;
  };
  return (
    <section className="print-report">
      <div className="page-heading">
        <div>
          <h2>Operational day report</h2>
          <p>8:00 AM through 7:59 AM the following day</p>
        </div>
        <div className="export-actions">
          <button className="secondary-button" onClick={() => window.print()}>
            Print
          </button>
          <button className="secondary-button" onClick={() => download('pdf')}>
            PDF
          </button>
          <button className="primary-button" onClick={() => download('xlsx')}>
            Excel
          </button>
        </div>
      </div>
      <div className="report-controls">
        <label>
          Operational date
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </label>
        <fieldset className="period-control">
          <legend>Statistics period</legend>
          <div>
            {(['day', 'week', 'month'] as const).map((value) => (
              <button
                type="button"
                key={value}
                className={period === value ? 'active' : ''}
                onClick={() => setPeriod(value)}
              >
                {value.charAt(0).toUpperCase() + value.slice(1)}
              </button>
            ))}
          </div>
        </fieldset>
      </div>
      {message && <p className="form-error">{message}</p>}
      {!report || !statistics ? (
        <p className="empty-state">Loading report...</p>
      ) : (
        <>
          <div className="metric-grid">
            <div>
              <span>Total payments</span>
              <strong>{formatMoney(statistics.totalAmountCentavos)}</strong>
            </div>
            <div>
              <span>Total stays</span>
              <strong>{statistics.totalStays}</strong>
            </div>
            <div>
              <span>Vehicle / Walk-in</span>
              <strong>
                {statistics.vehicleStays} / {statistics.walkInStays}
              </strong>
            </div>
            <div>
              <span>Selected period</span>
              <strong>
                {period.charAt(0).toUpperCase() + period.slice(1)}
              </strong>
            </div>
          </div>
          <h3>Selected operational day room type usage</h3>
          {report.byRoomType.length === 0 ? (
            <p className="empty-state">No stays for this operational day.</p>
          ) : (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Room type</th>
                    <th>Stays</th>
                    <th>Payments</th>
                  </tr>
                </thead>
                <tbody>
                  {report.byRoomType.map((item) => (
                    <tr key={item.roomType}>
                      <td>{item.roomType}</td>
                      <td>{item.stays}</td>
                      <td>{formatMoney(item.amountCentavos)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}

interface ShiftRecord {
  id: number;
  type: 'DAY' | 'NIGHT';
  startsAt: string;
  endsAt: string;
  totalAmountCentavos: number;
  _count: { stays: number };
}

function ShiftsView() {
  const [current, setCurrent] = useState<ShiftRecord | null>(null);
  const [history, setHistory] = useState<ShiftRecord[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    Promise.all([
      apiRequest<{ data: ShiftRecord }>('/shifts/current'),
      apiRequest<ApiCollection<ShiftRecord>>('/shifts/history'),
    ])
      .then(([currentResponse, historyResponse]) => {
        setCurrent(currentResponse.data);
        setHistory(historyResponse.data);
      })
      .catch((error: unknown) =>
        setMessage(
          error instanceof Error
            ? error.message
            : 'Shifts could not be loaded.',
        ),
      );
  }, []);
  return (
    <>
      <div className="page-heading">
        <div>
          <h2>Automatic shifts</h2>
          <p>Day 8:00 AM–8:00 PM · Night 8:00 PM–8:00 AM</p>
        </div>
      </div>
      {message && <p className="form-error">{message}</p>}
      {current && (
        <div className="current-shift">
          <span>Current shift</span>
          <strong>
            {current.type === 'DAY' ? 'Day shift' : 'Night shift'}
          </strong>
          <p>
            {formatDateTime(current.startsAt)} –{' '}
            {formatDateTime(current.endsAt)}
          </p>
          <small>
            {current._count.stays} stays ·{' '}
            {formatMoney(current.totalAmountCentavos)}
          </small>
        </div>
      )}
      <h3>Shift history</h3>
      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Shift</th>
              <th>Start</th>
              <th>End</th>
              <th>Stays</th>
              <th>Payments</th>
            </tr>
          </thead>
          <tbody>
            {history.map((shift) => (
              <tr key={shift.id}>
                <td>{shift.type === 'DAY' ? 'Day' : 'Night'}</td>
                <td>{formatDateTime(shift.startsAt)}</td>
                <td>{formatDateTime(shift.endsAt)}</td>
                <td>{shift._count.stays}</td>
                <td>{formatMoney(shift.totalAmountCentavos)}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'GCASH'>('CASH');
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
          paymentMethod,
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
          <fieldset className="segmented-field">
            <legend>Payment method</legend>
            <div>
              <button
                type="button"
                className={paymentMethod === 'CASH' ? 'active' : ''}
                onClick={() => setPaymentMethod('CASH')}
              >
                Cash
              </button>
              <button
                type="button"
                className={paymentMethod === 'GCASH' ? 'active' : ''}
                onClick={() => setPaymentMethod('GCASH')}
              >
                GCash
              </button>
            </div>
          </fieldset>
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

function ExtendStayDialog({
  room,
  stay,
  onClose,
  onExtended,
}: {
  room: Room;
  stay: Stay;
  onClose: () => void;
  onExtended: () => Promise<void>;
}) {
  const [durationHours, setDurationHours] = useState(
    String(room.roomType.rates[0]?.durationHours ?? ''),
  );
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'GCASH'>('CASH');
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
      await apiRequest(`/stays/${stay.id}/extensions`, {
        method: 'POST',
        body: JSON.stringify({
          durationHours: Number(durationHours),
          paymentMethod,
        }),
      });
      await onExtended();
    } catch (requestError: unknown) {
      setMessage(
        requestError instanceof Error
          ? requestError.message
          : 'The stay could not be extended.',
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
        aria-labelledby="extend-stay-title"
      >
        <div className="dialog-header">
          <div>
            <p className="dialog-eyebrow">Room {room.number}</p>
            <h2 id="extend-stay-title">Extend stay</h2>
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
          <label>
            Extension package
            <select
              required
              value={durationHours}
              onChange={(event) => setDurationHours(event.target.value)}
            >
              {room.roomType.rates.map((rate) => (
                <option key={rate.id} value={rate.durationHours}>
                  Add {rate.durationHours} hours ·{' '}
                  {formatMoney(rate.amountCentavos)}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="segmented-field">
            <legend>Payment method</legend>
            <div>
              <button
                type="button"
                className={paymentMethod === 'CASH' ? 'active' : ''}
                onClick={() => setPaymentMethod('CASH')}
              >
                Cash
              </button>
              <button
                type="button"
                className={paymentMethod === 'GCASH' ? 'active' : ''}
                onClick={() => setPaymentMethod('GCASH')}
              >
                GCash
              </button>
            </div>
          </fieldset>
          <div className="payment-summary">
            <span>Extension payment</span>
            <strong>
              {selectedRate
                ? formatMoney(selectedRate.amountCentavos)
                : 'Select a package'}
            </strong>
            <small>
              Added from the current checkout time. The saved rate remains
              unchanged if prices are edited later.
            </small>
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
              {saving ? 'Extending...' : 'Confirm extension'}
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
