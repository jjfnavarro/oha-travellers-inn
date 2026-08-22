import {
  lazy,
  Suspense,
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  BadgeDollarSign,
  BedDouble,
  CalendarDays,
  ChartNoAxesCombined,
  ClipboardList,
  Clock3,
  History,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  ShoppingBasket,
  ReceiptText,
  PackageSearch,
  Users,
} from 'lucide-react';
import { getOccupancyStatus, type OccupancyStatus } from './stay-status';
import { buzzerDurationSeconds, claimStayAlert } from './stay-alerts';
import { apiRequest, apiUrl } from './api';
import { BookingsView } from './BookingsView';
import { resolveHistoryWindow, type HistoryPeriod } from './history-period';
import { MiniStoreView } from './MiniStoreView';
import type { RevenueTrendPoint } from './RevenueCharts';
import { StoreReportView } from './StoreReportView';
import { ExpensesView } from './ExpensesView';
import { LostFoundView } from './LostFoundView';

const RevenueCharts = lazy(() =>
  import('./RevenueCharts').then((module) => ({
    default: module.RevenueCharts,
  })),
);

type OperationalStatus = 'ACTIVE' | 'CLEANING' | 'MAINTENANCE' | 'INACTIVE';
type VehicleType = 'MOTORCYCLE' | 'CAR' | 'VAN' | 'TRICYCLE' | 'OTHER_VEHICLE';
type View =
  | 'rooms'
  | 'bookings'
  | 'store'
  | 'expenses'
  | 'lost-found'
  | 'history'
  | 'reports'
  | 'shifts'
  | 'rates'
  | 'staff'
  | 'audit';
type StaffRole = 'OWNER' | 'FRONT_DESK';

interface StaffUser {
  id: number;
  username: string;
  role: StaffRole;
}
type RoomFilter =
  'ALL' | OccupancyStatus | 'CLEANING' | 'MAINTENANCE' | 'INACTIVE';

interface Rate {
  id: number;
  durationHours: number;
  amountCentavos: number;
}

interface RoomRateOverride extends Rate {
  roomId: number;
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
  rateOverrides: RoomRateOverride[];
  stays: Stay[];
}

function effectiveRoomRates(room: Room): Rate[] {
  return room.roomType.rates.map((rate) => ({
    ...rate,
    amountCentavos:
      (room.rateOverrides ?? []).find(
        (override) => override.durationHours === rate.durationHours,
      )?.amountCentavos ?? rate.amountCentavos,
  }));
}

interface Stay {
  id: number;
  roomId: number;
  arrivalType: 'VEHICLE' | 'WALK_IN';
  vehicleType: VehicleType | null;
  guestName: string | null;
  plateNumber: string | null;
  durationHours: number;
  numberOfDays?: number | null;
  rateAmountCentavos?: number | null;
  paidAmountCentavos: number;
  checkedInAt: string;
  expectedCheckoutAt: string;
  extensions: StayExtension[];
}

interface StayExtension {
  id: number;
  durationHours: number;
  amountCentavos: number;
  paymentMethod: 'CASH' | 'GCASH' | 'CARD' | 'UNKNOWN';
  createdAt: string;
}

interface HistoryStay extends Stay {
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  checkedOutAt: string | null;
  room: Room;
  shift: { type: 'DAY' | 'NIGHT' } | null;
  checkedInBy: { id: number; username: string } | null;
  checkedOutBy: { id: number; username: string } | null;
  storeSales: {
    id: number;
    paymentMethod: 'CASH' | 'GCASH' | 'CARD';
    totalAmountCentavos: number;
    createdAt: string;
    handledBy: { id: number; username: string };
    items: {
      id: number;
      productNameSnapshot: string;
      categorySnapshot: 'STORE_PRODUCT' | 'EXTRA_CHARGE';
      unitPriceCentavos: number;
      quantity: number;
      lineTotalCentavos: number;
    }[];
  }[];
}

interface ApiCollection<T> {
  data: T[];
}

const durations = [3, 6, 12, 24] as const;

function formatMoney(centavos: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 0,
  }).format(centavos / 100);
}

function statusLabel(status: OperationalStatus): string {
  if (status === 'ACTIVE') return 'Available';
  if (status === 'INACTIVE') return 'Archived';
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
  const [editRoom, setEditRoom] = useState<Room | null>(null);
  const [checkInRoom, setCheckInRoom] = useState<Room | null>(null);
  const [extendRoom, setExtendRoom] = useState<Room | null>(null);
  const [lostFoundRoomId, setLostFoundRoomId] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [soundReady, setSoundReady] = useState(false);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const audioContext = useRef<AudioContext | null>(null);
  const lastStayAlert = useRef(new Map<number, number>());
  const clearLostFoundRoom = useCallback(() => setLostFoundRoomId(null), []);

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
    if (!user) return;
    const refresh = () => {
      setIsOnline(true);
      setNow(Date.now());
      void loadInventory();
      window.dispatchEvent(new Event('oha:reconnected'));
    };
    const offline = () => setIsOnline(false);
    const visible = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) refresh();
    };
    const poll = window.setInterval(() => {
      if (navigator.onLine) void loadInventory();
    }, 30_000);
    window.addEventListener('online', refresh);
    window.addEventListener('offline', offline);
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.clearInterval(poll);
      window.removeEventListener('online', refresh);
      window.removeEventListener('offline', offline);
      document.removeEventListener('visibilitychange', visible);
    };
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
    const context = audioContext.current;
    if (!context || context.state === 'closed') return;

    const playBuzzer = () => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'square';
      gain.gain.setValueAtTime(0.38, context.currentTime);
      gain.gain.setValueAtTime(
        0.38,
        context.currentTime + buzzerDurationSeconds - 0.1,
      );
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        context.currentTime + buzzerDurationSeconds,
      );
      for (let step = 0; step < buzzerDurationSeconds * 4; step += 1) {
        oscillator.frequency.setValueAtTime(
          step % 2 === 0 ? 620 : 880,
          context.currentTime + step * 0.25,
        );
      }
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + buzzerDurationSeconds);
    };

    if (context.state === 'suspended') {
      void context
        .resume()
        .then(playBuzzer)
        .catch(() => {
          setError('The buzzer could not play on this device.');
        });
    } else {
      playBuzzer();
    }
  }

  useEffect(() => {
    if (soundReady || user?.role === 'OWNER') return;

    const armFrontDeskSound = () => {
      try {
        if (!audioContext.current || audioContext.current.state === 'closed') {
          audioContext.current = new window.AudioContext();
        }
        void audioContext.current
          .resume()
          .then(() => setSoundReady(true))
          .catch(() => {
            if (user?.role === 'FRONT_DESK') {
              setError('The front desk buzzer could not start on this device.');
            }
          });
      } catch {
        if (user?.role === 'FRONT_DESK') {
          setError('The front desk buzzer could not start on this device.');
        }
      }
    };

    window.addEventListener('pointerdown', armFrontDeskSound, {
      passive: true,
    });
    window.addEventListener('keydown', armFrontDeskSound);
    return () => {
      window.removeEventListener('pointerdown', armFrontDeskSound);
      window.removeEventListener('keydown', armFrontDeskSound);
    };
  }, [soundReady, user?.role]);

  useEffect(
    () => () => {
      if (audioContext.current?.state !== 'closed') {
        void audioContext.current?.close();
      }
    },
    [],
  );

  useEffect(() => {
    if (!soundReady || user?.role !== 'FRONT_DESK') return;
    for (const room of rooms) {
      const stay = room.stays[0];
      if (!stay) continue;
      const occupancy = getOccupancyStatus(stay, now);
      if (claimStayAlert(stay.id, occupancy, now, lastStayAlert.current)) {
        playAlert();
      }
    }
  }, [now, rooms, soundReady, user?.role]);

  const visibleRooms = useMemo(
    () =>
      rooms.filter((room) => {
        if (filter === 'ALL') return true;
        if (
          filter === 'CLEANING' ||
          filter === 'MAINTENANCE' ||
          filter === 'INACTIVE'
        )
          return room.operationalStatus === filter;
        return (
          room.operationalStatus === 'ACTIVE' &&
          getOccupancyStatus(room.stays[0], now) === filter
        );
      }),
    [filter, now, rooms],
  );
  const checkoutAlerts = useMemo(
    () =>
      rooms.flatMap((room) => {
        const stay = room.stays[0];
        if (!stay) return [];
        const status = getOccupancyStatus(stay, now);
        return status === 'DUE_SOON' || status === 'OVERDUE'
          ? [{ room, stay, status }]
          : [];
      }),
    [now, rooms],
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
          <div className={`connection ${isOnline ? '' : 'offline'}`}>
            <span aria-hidden="true" />
            {isOnline ? 'System Connected' : 'System Offline'}
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
        <button
          className={view === 'bookings' ? 'active' : ''}
          onClick={() => selectView('bookings')}
          title="Bookings"
        >
          <CalendarDays size={20} />
          <span>Bookings</span>
        </button>
        <button
          className={view === 'store' ? 'active' : ''}
          onClick={() => selectView('store')}
          title="Store"
        >
          <ShoppingBasket size={20} />
          <span>Store</span>
        </button>
        <button
          className={view === 'expenses' ? 'active' : ''}
          onClick={() => selectView('expenses')}
          title="Expenses"
        >
          <ReceiptText size={20} />
          <span>Expenses</span>
        </button>
        <button
          className={view === 'lost-found' ? 'active' : ''}
          onClick={() => selectView('lost-found')}
          title="Lost & Found"
        >
          <PackageSearch size={20} />
          <span>Lost &amp; Found</span>
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
      <button
        className="sidebar-floating-trigger"
        type="button"
        aria-label="Open sidebar"
        title="Open sidebar"
        onClick={() => setSidebarCollapsed(false)}
      >
        <PanelLeftOpen size={22} />
      </button>
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
              <div className="page-heading-actions">
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
            </div>

            {checkoutAlerts.length > 0 && (
              <section
                className="checkout-alerts"
                role="alert"
                aria-live="assertive"
              >
                <div className="checkout-alerts-heading">
                  <h3>Checkout alerts</h3>
                  <span>{checkoutAlerts.length} active</span>
                </div>
                {checkoutAlerts.map(({ room, stay, status }) => (
                  <article
                    className={`checkout-alert ${status.toLowerCase()}`}
                    key={stay.id}
                  >
                    <div>
                      <strong>Room {room.number}</strong>
                      <span>
                        {status === 'OVERDUE' ? 'Overdue' : 'Checkout soon'} ·{' '}
                        {formatRemaining(stay, now)}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => void checkOut(stay)}
                    >
                      Check out
                    </button>
                  </article>
                ))}
              </section>
            )}

            <div className="filter-bar" aria-label="Filter rooms">
              {(
                [
                  'ALL',
                  'VACANT',
                  'OCCUPIED',
                  'DUE_SOON',
                  'OVERDUE',
                  'CLEANING',
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
                    : status === 'CLEANING' ||
                        status === 'MAINTENANCE' ||
                        status === 'INACTIVE'
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
                        <div>
                          <strong
                            className={
                              room.number.length > 8
                                ? 'long-room-number'
                                : undefined
                            }
                          >
                            {room.number}
                          </strong>
                          {user.role === 'OWNER' && (
                            <button
                              className="icon-button compact-icon-button"
                              type="button"
                              aria-label={`Manage room ${room.number}`}
                              title="Manage room"
                              onClick={() => setEditRoom(room)}
                            >
                              <Pencil size={15} />
                            </button>
                          )}
                        </div>
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
                          <option value="CLEANING">Cleaning</option>
                          <option value="MAINTENANCE">Maintenance</option>
                          {user.role === 'OWNER' && (
                            <option value="INACTIVE">Archived</option>
                          )}
                        </select>
                      </label>
                      {room.operationalStatus === 'CLEANING' && (
                        <button
                          className="secondary-button report-found-item-button"
                          type="button"
                          onClick={() => {
                            setLostFoundRoomId(room.id);
                            selectView('lost-found');
                          }}
                        >
                          <PackageSearch size={16} aria-hidden="true" />
                          Report found item
                        </button>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </>
        ) : view === 'rates' ? (
          <RatesView
            roomTypes={roomTypes}
            rooms={rooms}
            onUpdated={loadInventory}
            setError={setError}
          />
        ) : view === 'history' ? (
          <HistoryView rooms={rooms} roomTypes={roomTypes} />
        ) : view === 'bookings' ? (
          <BookingsView rooms={rooms} onStayCreated={loadInventory} />
        ) : view === 'store' ? (
          <MiniStoreView isOwner={user.role === 'OWNER'} rooms={rooms} />
        ) : view === 'expenses' ? (
          <ExpensesView isOwner={user.role === 'OWNER'} />
        ) : view === 'lost-found' ? (
          <LostFoundView
            role={user.role}
            rooms={rooms}
            initialRoomId={lostFoundRoomId}
            onInitialRoomHandled={clearLostFoundRoom}
          />
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
      {editRoom && user.role === 'OWNER' && (
        <EditRoomDialog
          room={editRoom}
          roomTypes={roomTypes}
          onClose={() => setEditRoom(null)}
          onSaved={async () => {
            setEditRoom(null);
            await loadInventory();
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
  rooms,
  onUpdated,
  setError,
}: {
  roomTypes: RoomType[];
  rooms: Room[];
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
  const [roomDrafts, setRoomDrafts] = useState<
    Record<number, Record<number, string>>
  >(() =>
    Object.fromEntries(
      rooms.map((room) => [
        room.id,
        Object.fromEntries(
          (room.rateOverrides ?? []).map((rate) => [
            rate.durationHours,
            String(rate.amountCentavos / 100),
          ]),
        ),
      ]),
    ),
  );
  const [savingRoomId, setSavingRoomId] = useState<number | null>(null);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);

  useEffect(() => {
    setRoomDrafts(
      Object.fromEntries(
        rooms.map((room) => [
          room.id,
          Object.fromEntries(
            (room.rateOverrides ?? []).map((rate) => [
              rate.durationHours,
              String(rate.amountCentavos / 100),
            ]),
          ),
        ]),
      ),
    );
  }, [rooms]);

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

  async function saveRoomRates(room: Room): Promise<void> {
    const draft = roomDrafts[room.id] ?? {};
    const overrides = room.roomType.rates.flatMap((baseRate) => {
      const value = draft[baseRate.durationHours]?.trim() ?? '';
      if (!value) return [];
      const amount = Number(value);
      return Number.isFinite(amount) && amount > 0
        ? [
            {
              durationHours: baseRate.durationHours,
              amountCentavos: Math.round(amount * 100),
            },
          ]
        : [];
    });
    const hasInvalidValue = room.roomType.rates.some((baseRate) => {
      const value = draft[baseRate.durationHours]?.trim() ?? '';
      return (
        value.length > 0 &&
        (!Number.isFinite(Number(value)) || Number(value) <= 0)
      );
    });
    if (hasInvalidValue) {
      setError('Room-specific rates must be blank or greater than zero.');
      return;
    }
    setSavingRoomId(room.id);
    setError(null);
    try {
      await apiRequest(`/rooms/${room.id}/rates`, {
        method: 'PATCH',
        body: JSON.stringify({ overrides }),
      });
      await onUpdated();
    } catch (requestError: unknown) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Room-specific rates could not be saved.',
      );
    } finally {
      setSavingRoomId(null);
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
      <div className="section-heading room-rate-heading">
        <div>
          <h3>Room-specific rates</h3>
          <p>Leave a price blank to use the room type rate.</p>
        </div>
      </div>
      <div className="rate-table-wrap">
        <table className="rate-table room-rate-table">
          <thead>
            <tr>
              <th>Room</th>
              {durations.map((duration) => (
                <th key={duration}>{duration} hours</th>
              ))}
              <th>
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rooms.map((room) => (
              <tr key={room.id}>
                <th>
                  <strong>Room {room.number}</strong>
                  <span>{room.roomType.name}</span>
                </th>
                {durations.map((duration) => {
                  const baseRate = room.roomType.rates.find(
                    (rate) => rate.durationHours === duration,
                  );
                  return (
                    <td key={duration}>
                      {baseRate ? (
                        <label>
                          <span>₱</span>
                          <input
                            aria-label={`Room ${room.number} ${duration}-hour override`}
                            type="number"
                            min="1"
                            step="1"
                            placeholder={`Default ${baseRate.amountCentavos / 100}`}
                            value={roomDrafts[room.id]?.[duration] ?? ''}
                            onChange={(event) =>
                              setRoomDrafts((current) => ({
                                ...current,
                                [room.id]: {
                                  ...current[room.id],
                                  [duration]: event.target.value,
                                },
                              }))
                            }
                          />
                        </label>
                      ) : (
                        <span className="rate-not-offered">Not offered</span>
                      )}
                    </td>
                  );
                })}
                <td>
                  <div className="rate-room-actions">
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => setEditingRoom(room)}
                    >
                      <Pencil size={15} aria-hidden="true" />
                      Edit details
                    </button>
                    <button
                      className="secondary-button"
                      type="button"
                      disabled={savingRoomId === room.id}
                      onClick={() => void saveRoomRates(room)}
                    >
                      {savingRoomId === room.id ? 'Saving...' : 'Save rates'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editingRoom && (
        <EditRoomDialog
          room={editingRoom}
          roomTypes={roomTypes}
          onClose={() => setEditingRoom(null)}
          onSaved={async () => {
            setEditingRoom(null);
            await onUpdated();
          }}
        />
      )}
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
  const [period, setPeriod] = useState<HistoryPeriod>('TODAY');
  const [referenceDate] = useState(manilaOperationalDate);
  const [status, setStatus] = useState('ALL');
  const [arrival, setArrival] = useState('ALL');
  const [from, setFrom] = useState(manilaOperationalDate);
  const [to, setTo] = useState(manilaOperationalDate);
  const [roomId, setRoomId] = useState('ALL');
  const [roomTypeId, setRoomTypeId] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const historyQuery = useMemo(() => {
    const parameters = new URLSearchParams();
    if (status !== 'ALL') parameters.set('status', status);
    if (arrival !== 'ALL') parameters.set('arrivalType', arrival);
    const window = resolveHistoryWindow(period, referenceDate, from, to);
    if (window.from) parameters.set('from', window.from);
    if (window.to) parameters.set('to', window.to);
    if (roomId !== 'ALL') parameters.set('roomId', roomId);
    if (roomTypeId !== 'ALL') parameters.set('roomTypeId', roomTypeId);
    return parameters.toString();
  }, [arrival, from, period, referenceDate, roomId, roomTypeId, status, to]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setMessage(null);
    apiRequest<ApiCollection<HistoryStay>>(`/stays/history?${historyQuery}`)
      .then((response) => {
        if (active) setStays(response.data);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setMessage(
          error instanceof Error
            ? error.message
            : 'History could not be loaded.',
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [historyQuery]);

  const download = (extension: 'pdf' | 'xlsx') => {
    window.location.href = `${apiUrl}/stays/history.${extension}?${historyQuery}`;
  };

  return (
    <section className="print-report history-report">
      <div className="page-heading">
        <div>
          <h2>Stay history</h2>
          <p>Up to 500 recent check-ins</p>
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
          Period
          <select
            value={period}
            onChange={(event) => setPeriod(event.target.value as HistoryPeriod)}
          >
            <option value="TODAY">Today</option>
            <option value="WEEK">This week</option>
            <option value="MONTH">This month</option>
            <option value="ALL">All history</option>
            <option value="CUSTOM">Custom dates</option>
          </select>
        </label>
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
        {period === 'CUSTOM' && (
          <>
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
          </>
        )}
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
                <th>Store purchases</th>
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
                    {stay.numberOfDays
                      ? `${stay.numberOfDays} ${stay.numberOfDays === 1 ? 'day' : 'days'} (${stay.durationHours} hours)`
                      : `${stay.durationHours} hours`}
                    <small>{stay.shift?.type ?? ''} shift</small>
                  </td>
                  <td>
                    {stay.arrivalType === 'WALK_IN' ? 'Walk-in' : 'Vehicle'}
                    <small>
                      {stay.vehicleType
                        ? stay.vehicleType.replaceAll('_', ' ')
                        : (stay.plateNumber ?? stay.guestName ?? '')}
                    </small>
                  </td>
                  <td>{formatMoney(stay.paidAmountCentavos)}</td>
                  <td>
                    {stay.storeSales.length === 0 ? (
                      '—'
                    ) : (
                      <div className="history-store-sales">
                        {stay.storeSales.map((sale) => (
                          <div key={sale.id}>
                            <strong>
                              {sale.items
                                .map(
                                  (item) =>
                                    `${item.quantity} × ${item.productNameSnapshot}`,
                                )
                                .join(', ')}
                            </strong>
                            <small>
                              {formatMoney(sale.totalAmountCentavos)} ·{' '}
                              {sale.paymentMethod === 'GCASH'
                                ? 'GCash'
                                : sale.paymentMethod === 'CARD'
                                  ? 'Card'
                                  : 'Cash'}
                            </small>
                            <small>
                              {sale.handledBy.username} ·{' '}
                              {formatDateTime(sale.createdAt)}
                            </small>
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
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
    </section>
  );
}

type OwnerReportPreset =
  | 'current_shift'
  | 'previous_shift'
  | 'today'
  | 'specific_date'
  | 'week'
  | 'month'
  | 'year'
  | 'custom';
type OwnerReportShift = 'ALL' | 'DAY' | 'NIGHT';
type ReportCategory = 'OVERALL' | 'ROOMS' | 'STORE';
type ReportPaymentMethod = 'ALL' | 'CASH' | 'GCASH' | 'CARD';

interface OwnerReportResponse {
  generatedAt: string;
  viewMode: 'OVERALL' | 'BY_STAFF';
  selectedStaff: StaffUser | null;
  filters: {
    preset: OwnerReportPreset;
    shift: OwnerReportShift;
    startsAt: string;
    endsAt: string;
    label: string;
  };
  summary: {
    totalCheckIns: number;
    completedStays: number;
    activeStays: number;
    totalRoomUses: number;
    uniqueRoomsUsed: number;
    walkInCount: number;
    vehicleCount: number;
    extensionCount: number;
    overdueCheckoutCount: number;
  };
  financial: {
    grossRoomRevenueCentavos: number;
    extensionRevenueCentavos: number;
    storeRevenueCentavos: number;
    extraChargesRevenueCentavos: number;
    grossRevenueCentavos: number;
    cashRevenueCentavos: number;
    cashExpensesCentavos: number;
    expenseCount: number;
    expenseReversalCount: number;
    netRevenueCentavos: number;
    expectedRemainingCashCentavos: number;
    totalCollectedCentavos: number;
  };
  revenueTrend: RevenueTrendPoint[];
  packages: {
    durationHours: number;
    numberOfDays: number | null;
    count: number;
    revenueCentavos: number;
  }[];
  roomUsage: {
    roomId: number;
    roomNumber: string;
    roomType: string;
    uses: number;
  }[];
  paymentMethods: {
    method: 'CASH' | 'GCASH' | 'CARD' | 'UNKNOWN';
    count: number;
    amountCentavos: number;
  }[];
  expenses: {
    id: number;
    amountCentavos: number;
    reason: string;
    status: 'ACTIVE' | 'VOIDED';
    businessDate: string;
    createdAt: string;
    recordedBy: { id: number; username: string };
    shift: { id: number; type: 'DAY' | 'NIGHT' };
    voidedAt: string | null;
    voidReason: string | null;
    voidedBy: { id: number; username: string } | null;
  }[];
  vehicleTypes: { type: VehicleType; count: number }[];
  activity: {
    id: number;
    createdAt: string;
    staff: { id: number; username: string } | null;
    action: string;
    roomNumber: string | null;
    stayId: number | null;
    bookingId: number | null;
    storeSaleId: number | null;
    productId: number | null;
    amountCentavos: number | null;
    previousValue: unknown;
    newValue: unknown;
  }[];
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
  const [reportCategory, setReportCategory] =
    useState<ReportCategory>('OVERALL');
  const [date, setDate] = useState(manilaOperationalDate);
  const [from, setFrom] = useState(manilaOperationalDate);
  const [to, setTo] = useState(manilaOperationalDate);
  const [preset, setPreset] = useState<OwnerReportPreset>('today');
  const [shift, setShift] = useState<OwnerReportShift>('ALL');
  const [paymentMethod, setPaymentMethod] =
    useState<ReportPaymentMethod>('ALL');
  const [viewMode, setViewMode] = useState<'OVERALL' | 'BY_STAFF'>('OVERALL');
  const [staffId, setStaffId] = useState('');
  const [staff, setStaff] = useState<StaffRecord[]>([]);
  const [report, setReport] = useState<OwnerReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<ApiCollection<StaffRecord>>('/staff')
      .then((response) => {
        setStaff(response.data);
        setStaffId((current) => current || String(response.data[0]?.id ?? ''));
      })
      .catch((error: unknown) =>
        setMessage(
          error instanceof Error
            ? error.message
            : 'Staff accounts could not be loaded.',
        ),
      );
  }, []);

  const query = useMemo(() => {
    const parameters = new URLSearchParams({ preset, shift });
    if (['specific_date', 'week', 'month', 'year'].includes(preset)) {
      parameters.set('date', date);
    }
    if (preset === 'custom') {
      parameters.set('from', from);
      parameters.set('to', to);
    }
    if (viewMode === 'BY_STAFF' && staffId) {
      parameters.set('staffId', staffId);
    }
    if (paymentMethod !== 'ALL') {
      parameters.set('paymentMethod', paymentMethod);
    }
    return parameters.toString();
  }, [date, from, paymentMethod, preset, shift, staffId, to, viewMode]);
  const ownerQuery = useMemo(() => {
    const parameters = new URLSearchParams(query);
    parameters.set('scope', reportCategory === 'ROOMS' ? 'ROOMS' : 'OVERALL');
    return parameters.toString();
  }, [query, reportCategory]);

  useEffect(() => {
    if (reportCategory === 'STORE') {
      setLoading(false);
      setMessage(null);
      return;
    }
    if (viewMode === 'BY_STAFF' && !staffId) return;
    let active = true;
    setLoading(true);
    apiRequest<{ data: OwnerReportResponse }>(`/reports/owner?${ownerQuery}`)
      .then((response) => {
        if (!active) return;
        setReport(response.data);
        setMessage(null);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setMessage(
          error instanceof Error
            ? error.message
            : 'Report could not be loaded.',
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [ownerQuery, reportCategory, staffId, viewMode]);

  const download = (extension: 'pdf' | 'xlsx') => {
    window.location.href =
      reportCategory === 'STORE'
        ? `${apiUrl}/reports/store/${extension}?${query}`
        : `${apiUrl}/reports/owner.${extension}?${ownerQuery}`;
  };

  return (
    <section className="print-report">
      <div className="page-heading">
        <div>
          <h2>Reports</h2>
          <p>
            {reportCategory === 'OVERALL'
              ? 'Combined room and store performance'
              : reportCategory === 'ROOMS'
                ? 'Room operations and revenue'
                : 'Store products and extra charges'}
          </p>
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
      <div className="report-controls owner-report-controls">
        <label>
          Report type
          <select
            value={reportCategory}
            onChange={(event) =>
              setReportCategory(event.target.value as ReportCategory)
            }
          >
            <option value="OVERALL">Overall</option>
            <option value="ROOMS">Rooms</option>
            <option value="STORE">Store</option>
          </select>
        </label>
        <label>
          Reporting period
          <select
            value={preset}
            onChange={(event) =>
              setPreset(event.target.value as OwnerReportPreset)
            }
          >
            <option value="current_shift">Current shift</option>
            <option value="previous_shift">Previous shift</option>
            <option value="today">Today</option>
            <option value="specific_date">Specific date</option>
            <option value="week">This week</option>
            <option value="month">This month</option>
            <option value="year">This year</option>
            <option value="custom">Custom date range</option>
          </select>
        </label>
        {['specific_date', 'week', 'month', 'year'].includes(preset) && (
          <label>
            Reference date
            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </label>
        )}
        {preset === 'custom' && (
          <>
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
                min={from}
                onChange={(event) => setTo(event.target.value)}
              />
            </label>
          </>
        )}
        <label>
          Shift
          <select
            value={shift}
            onChange={(event) =>
              setShift(event.target.value as OwnerReportShift)
            }
          >
            <option value="ALL">All shifts</option>
            <option value="DAY">Day shift</option>
            <option value="NIGHT">Night shift</option>
          </select>
        </label>
        <label>
          Payment method
          <select
            value={paymentMethod}
            onChange={(event) =>
              setPaymentMethod(event.target.value as ReportPaymentMethod)
            }
          >
            <option value="ALL">All payments</option>
            <option value="CASH">Cash</option>
            <option value="GCASH">GCash</option>
            <option value="CARD">Card</option>
          </select>
        </label>
        <fieldset className="period-control report-view-control">
          <legend>View</legend>
          <div>
            <button
              type="button"
              className={viewMode === 'OVERALL' ? 'active' : ''}
              onClick={() => setViewMode('OVERALL')}
            >
              Overall
            </button>
            <button
              type="button"
              className={viewMode === 'BY_STAFF' ? 'active' : ''}
              onClick={() => setViewMode('BY_STAFF')}
            >
              By staff
            </button>
          </div>
        </fieldset>
        {viewMode === 'BY_STAFF' && (
          <label>
            Staff account
            <select
              value={staffId}
              onChange={(event) => setStaffId(event.target.value)}
            >
              {staff.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.username} ·{' '}
                  {account.role === 'OWNER' ? 'Owner' : 'Front desk'}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {message && <p className="form-error">{message}</p>}
      {reportCategory === 'STORE' ? (
        <StoreReportView embeddedQuery={query} />
      ) : loading || !report ? (
        <p className="empty-state">Loading report...</p>
      ) : (
        <>
          <div className="metric-grid owner-metric-grid">
            <div>
              <span>
                {reportCategory === 'OVERALL'
                  ? 'Gross revenue'
                  : 'Room revenue'}
              </span>
              <strong>
                {formatMoney(report.financial.grossRevenueCentavos)}
              </strong>
            </div>
            {reportCategory === 'OVERALL' && (
              <>
                <div>
                  <span>Cash expenses</span>
                  <strong>
                    {formatMoney(report.financial.cashExpensesCentavos)}
                  </strong>
                </div>
                <div>
                  <span>Net revenue</span>
                  <strong>
                    {formatMoney(report.financial.netRevenueCentavos)}
                  </strong>
                </div>
                <div>
                  <span>Expected remaining cash</span>
                  <strong>
                    {formatMoney(
                      report.financial.expectedRemainingCashCentavos,
                    )}
                  </strong>
                </div>
                <div>
                  <span>Room revenue</span>
                  <strong>
                    {formatMoney(
                      report.financial.grossRoomRevenueCentavos +
                        report.financial.extensionRevenueCentavos,
                    )}
                  </strong>
                </div>
                <div>
                  <span>Store and extra charges</span>
                  <strong>
                    {formatMoney(
                      report.financial.storeRevenueCentavos +
                        report.financial.extraChargesRevenueCentavos,
                    )}
                  </strong>
                </div>
              </>
            )}
            <div>
              <span>Check-ins</span>
              <strong>{report.summary.totalCheckIns}</strong>
            </div>
            <div>
              <span>Completed stays</span>
              <strong>{report.summary.completedStays}</strong>
            </div>
            <div>
              <span>Room uses</span>
              <strong>{report.summary.totalRoomUses}</strong>
            </div>
            <div>
              <span>Extensions</span>
              <strong>{report.summary.extensionCount}</strong>
            </div>
            <div>
              <span>Active stays created</span>
              <strong>{report.summary.activeStays}</strong>
            </div>
            <div>
              <span>Overdue checkouts</span>
              <strong>{report.summary.overdueCheckoutCount}</strong>
            </div>
          </div>

          <Suspense fallback={<div className="revenue-chart-loading" />}>
            <RevenueCharts
              trend={report.revenueTrend}
              breakdown={
                reportCategory === 'ROOMS'
                  ? [
                      {
                        name: 'Rooms',
                        amountCentavos:
                          report.financial.grossRoomRevenueCentavos,
                        color: '#1c1c1c',
                      },
                      {
                        name: 'Extensions',
                        amountCentavos:
                          report.financial.extensionRevenueCentavos,
                        color: '#707070',
                      },
                    ]
                  : [
                      {
                        name: 'Rooms',
                        amountCentavos:
                          report.financial.grossRoomRevenueCentavos,
                        color: '#1c1c1c',
                      },
                      {
                        name: 'Extensions',
                        amountCentavos:
                          report.financial.extensionRevenueCentavos,
                        color: '#707070',
                      },
                      {
                        name: 'Store',
                        amountCentavos: report.financial.storeRevenueCentavos,
                        color: '#18823b',
                      },
                      {
                        name: 'Extras',
                        amountCentavos:
                          report.financial.extraChargesRevenueCentavos,
                        color: '#a05a2c',
                      },
                    ]
              }
              paymentBreakdown={report.paymentMethods.map((item) => ({
                name:
                  item.method === 'GCASH'
                    ? 'GCash'
                    : item.method === 'CARD'
                      ? 'Card'
                      : item.method === 'CASH'
                        ? 'Cash'
                        : 'Legacy',
                amountCentavos: item.amountCentavos,
                color:
                  item.method === 'CASH'
                    ? '#1c1c1c'
                    : item.method === 'GCASH'
                      ? '#18823b'
                      : item.method === 'CARD'
                        ? '#9a5b13'
                        : '#777777',
              }))}
            />
          </Suspense>

          <div className="report-breakdown-grid">
            <section>
              <h3>Financial breakdown</h3>
              <div className="data-table-wrap">
                <table className="data-table compact-report-table">
                  <tbody>
                    <tr>
                      <th>Room charges</th>
                      <td>
                        {formatMoney(report.financial.grossRoomRevenueCentavos)}
                      </td>
                    </tr>
                    <tr>
                      <th>Extension charges</th>
                      <td>
                        {formatMoney(report.financial.extensionRevenueCentavos)}
                      </td>
                    </tr>
                    {reportCategory === 'OVERALL' && (
                      <>
                        <tr>
                          <th>Store revenue</th>
                          <td>
                            {formatMoney(report.financial.storeRevenueCentavos)}
                          </td>
                        </tr>
                        <tr>
                          <th>Extra charges</th>
                          <td>
                            {formatMoney(
                              report.financial.extraChargesRevenueCentavos,
                            )}
                          </td>
                        </tr>
                        <tr>
                          <th>Gross revenue</th>
                          <td>
                            {formatMoney(report.financial.grossRevenueCentavos)}
                          </td>
                        </tr>
                        <tr>
                          <th>Cash expenses</th>
                          <td>
                            -
                            {formatMoney(report.financial.cashExpensesCentavos)}
                          </td>
                        </tr>
                        <tr>
                          <th>Net revenue</th>
                          <td>
                            <strong>
                              {formatMoney(report.financial.netRevenueCentavos)}
                            </strong>
                          </td>
                        </tr>
                        <tr>
                          <th>Expected remaining cash</th>
                          <td>
                            {formatMoney(
                              report.financial.expectedRemainingCashCentavos,
                            )}
                          </td>
                        </tr>
                      </>
                    )}
                    <tr>
                      <th>Total collected</th>
                      <td>
                        <strong>
                          {formatMoney(report.financial.totalCollectedCentavos)}
                        </strong>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
            <section>
              <h3>Guest and room summary</h3>
              <div className="data-table-wrap">
                <table className="data-table compact-report-table">
                  <tbody>
                    <tr>
                      <th>Unique rooms used</th>
                      <td>{report.summary.uniqueRoomsUsed}</td>
                    </tr>
                    <tr>
                      <th>Vehicle arrivals</th>
                      <td>{report.summary.vehicleCount}</td>
                    </tr>
                    <tr>
                      <th>Walk-ins</th>
                      <td>{report.summary.walkInCount}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          {reportCategory === 'OVERALL' && (
            <section className="report-expenses">
              <h3>Expenses</h3>
              {(report.expenses ?? []).length === 0 ? (
                <p className="empty-state">No Cash expenses for this period.</p>
              ) : (
                <div className="data-table-wrap">
                  <table className="data-table compact-report-table">
                    <thead>
                      <tr>
                        <th>Date and time</th>
                        <th>Reason</th>
                        <th>Recorded by</th>
                        <th>Shift</th>
                        <th>Amount</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(report.expenses ?? []).map((expense) => (
                        <tr key={expense.id}>
                          <td>{formatDateTime(expense.createdAt)}</td>
                          <td>{expense.reason}</td>
                          <td>{expense.recordedBy.username}</td>
                          <td>
                            {expense.shift.type === 'DAY' ? 'Day' : 'Night'}
                          </td>
                          <td>{formatMoney(expense.amountCentavos)}</td>
                          <td>
                            {expense.status === 'ACTIVE' ? 'Active' : 'Voided'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          <h3>Package breakdown</h3>
          <div className="data-table-wrap">
            <table className="data-table compact-report-table">
              <thead>
                <tr>
                  <th>Package</th>
                  <th>Check-ins</th>
                  <th>Revenue handled</th>
                </tr>
              </thead>
              <tbody>
                {report.packages.map((item) => (
                  <tr
                    key={`${item.numberOfDays === null ? 'hours' : `days-${item.numberOfDays}`}-${item.durationHours}`}
                  >
                    <td>
                      {item.numberOfDays
                        ? `${item.numberOfDays} ${item.numberOfDays === 1 ? 'day' : 'days'} (${item.durationHours} hours)`
                        : `${item.durationHours} hours`}
                    </td>
                    <td>{item.count}</td>
                    <td>{formatMoney(item.revenueCentavos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="report-breakdown-grid">
            <section>
              <h3>Room usage</h3>
              {report.roomUsage.length === 0 ? (
                <p className="empty-state">No room usage for this period.</p>
              ) : (
                <div className="data-table-wrap">
                  <table className="data-table compact-report-table">
                    <thead>
                      <tr>
                        <th>Room</th>
                        <th>Type</th>
                        <th>Uses</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.roomUsage.map((item) => (
                        <tr key={item.roomId}>
                          <td>{item.roomNumber}</td>
                          <td>{item.roomType}</td>
                          <td>{item.uses}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
            <section>
              <h3>Payment methods</h3>
              <div className="data-table-wrap">
                <table className="data-table compact-report-table">
                  <thead>
                    <tr>
                      <th>Method</th>
                      <th>Transactions</th>
                      <th>Collected</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.paymentMethods.map((item) => (
                      <tr key={item.method}>
                        <td>
                          {item.method === 'GCASH'
                            ? 'GCash'
                            : item.method === 'CARD'
                              ? 'Card'
                              : item.method === 'CASH'
                                ? 'Cash'
                                : 'Legacy / unknown'}
                        </td>
                        <td>{item.count}</td>
                        <td>{formatMoney(item.amountCentavos)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <section>
              <h3>Vehicle types</h3>
              <div className="data-table-wrap">
                <table className="data-table compact-report-table">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Arrivals</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.vehicleTypes.map((item) => (
                      <tr key={item.type}>
                        <td>{item.type.replaceAll('_', ' ')}</td>
                        <td>{item.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <h3>Detailed activity</h3>
          {report.activity.length === 0 ? (
            <p className="empty-state">No recorded activity for this period.</p>
          ) : (
            <div className="data-table-wrap">
              <table className="data-table report-activity-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Staff</th>
                    <th>Action</th>
                    <th>Room</th>
                    <th>Stay</th>
                    <th>Booking</th>
                    <th>Store sale</th>
                    <th>Amount / Change</th>
                  </tr>
                </thead>
                <tbody>
                  {report.activity.map((item) => (
                    <tr key={item.id}>
                      <td>{formatDateTime(item.createdAt)}</td>
                      <td>{item.staff?.username ?? 'Legacy / system'}</td>
                      <td>{item.action.replaceAll('_', ' ')}</td>
                      <td>{item.roomNumber ?? '—'}</td>
                      <td>{item.stayId ? `#${item.stayId}` : '—'}</td>
                      <td>{item.bookingId ? `#${item.bookingId}` : '—'}</td>
                      <td>{item.storeSaleId ? `#${item.storeSaleId}` : '—'}</td>
                      <td>
                        {item.amountCentavos !== null
                          ? formatMoney(item.amountCentavos)
                          : item.previousValue !== null ||
                              item.newValue !== null
                            ? `${String(item.previousValue ?? '—')} → ${String(
                                item.newValue ?? '—',
                              )}`
                            : '—'}
                      </td>
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
  const roomRates = effectiveRoomRates(room);
  const [durationHours, setDurationHours] = useState(
    String(roomRates[0]?.durationHours ?? ''),
  );
  const [numberOfDays, setNumberOfDays] = useState('1');
  const [arrivalType, setArrivalType] = useState<'VEHICLE' | 'WALK_IN'>(
    'VEHICLE',
  );
  const [vehicleType, setVehicleType] = useState<VehicleType>('CAR');
  const [guestName, setGuestName] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'GCASH' | 'CARD'>(
    'CASH',
  );
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const selectedRate = roomRates.find(
    (rate) => rate.durationHours === Number(durationHours),
  );
  const dayRate = roomRates.find((rate) => rate.durationHours === 24);
  const parsedDays = Number(numberOfDays);
  const daysAreValid =
    Number.isInteger(parsedDays) && parsedDays >= 1 && parsedDays <= 365;
  const isDays = durationHours === 'DAYS';
  const totalHours =
    isDays && daysAreValid ? parsedDays * 24 : Number(durationHours);
  const totalAmountCentavos = isDays
    ? daysAreValid && dayRate
      ? parsedDays * dayRate.amountCentavos
      : null
    : (selectedRate?.amountCentavos ?? null);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await apiRequest('/stays/check-in', {
        method: 'POST',
        body: JSON.stringify({
          roomId: room.id,
          ...(isDays
            ? { numberOfDays: parsedDays }
            : { durationHours: Number(durationHours) }),
          arrivalType,
          vehicleType: arrivalType === 'VEHICLE' ? vehicleType : null,
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
              {roomRates.map((rate) => (
                <option key={rate.id} value={rate.durationHours}>
                  {rate.durationHours} hours ·{' '}
                  {formatMoney(rate.amountCentavos)}
                </option>
              ))}
              {dayRate && <option value="DAYS">Days</option>}
            </select>
          </label>
          {isDays && (
            <>
              <label>
                Number of days
                <input
                  required
                  type="number"
                  min={1}
                  max={365}
                  step={1}
                  inputMode="numeric"
                  value={numberOfDays}
                  onChange={(event) => setNumberOfDays(event.target.value)}
                />
              </label>
              {daysAreValid && dayRate && (
                <div className="stay-calculation" aria-live="polite">
                  <span>Total duration: {totalHours} hours</span>
                  <span>
                    24-hour rate: {formatMoney(dayRate.amountCentavos)}
                  </span>
                  <span>
                    Checkout:{' '}
                    {formatDateTime(
                      new Date(
                        Date.now() + totalHours * 60 * 60 * 1000,
                      ).toISOString(),
                    )}
                  </span>
                </div>
              )}
            </>
          )}
          <label>
            Guest name <span className="optional">Optional</span>
            <input
              maxLength={100}
              value={guestName}
              onChange={(event) => setGuestName(event.target.value)}
            />
          </label>
          {arrivalType === 'VEHICLE' && (
            <>
              <label>
                Vehicle type
                <select
                  value={vehicleType}
                  onChange={(event) =>
                    setVehicleType(event.target.value as VehicleType)
                  }
                >
                  <option value="MOTORCYCLE">Motorcycle</option>
                  <option value="CAR">Car</option>
                  <option value="VAN">Van</option>
                  <option value="TRICYCLE">Tricycle</option>
                  <option value="OTHER_VEHICLE">Other vehicle</option>
                </select>
              </label>
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
            </>
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
              <button
                type="button"
                className={paymentMethod === 'CARD' ? 'active' : ''}
                onClick={() => setPaymentMethod('CARD')}
              >
                Card
              </button>
            </div>
          </fieldset>
          <div className="payment-summary">
            <span>Payment at check-in</span>
            <strong>
              {totalAmountCentavos !== null
                ? formatMoney(totalAmountCentavos)
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
              disabled={saving || totalAmountCentavos === null}
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
  const roomRates = effectiveRoomRates(room);
  const [durationHours, setDurationHours] = useState(
    String(roomRates[0]?.durationHours ?? ''),
  );
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'GCASH' | 'CARD'>(
    'CASH',
  );
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const selectedRate = roomRates.find(
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
              {roomRates.map((rate) => (
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
              <button
                type="button"
                className={paymentMethod === 'CARD' ? 'active' : ''}
                onClick={() => setPaymentMethod('CARD')}
              >
                Card
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
            Room name or number
            <input
              autoFocus
              required
              maxLength={30}
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

function EditRoomDialog({
  room,
  roomTypes,
  onClose,
  onSaved,
}: {
  room: Room;
  roomTypes: RoomType[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [number, setNumber] = useState(room.number);
  const [roomTypeId, setRoomTypeId] = useState(String(room.roomTypeId));
  const [displayOrder, setDisplayOrder] = useState(String(room.displayOrder));
  const [operationalStatus, setOperationalStatus] = useState<OperationalStatus>(
    room.operationalStatus,
  );
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(event: FormEvent): Promise<void> {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await apiRequest(`/rooms/${room.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          number,
          roomTypeId: Number(roomTypeId),
          displayOrder: Number(displayOrder),
          operationalStatus,
        }),
      });
      await onSaved();
    } catch (error: unknown) {
      setMessage(
        error instanceof Error ? error.message : 'Room could not be updated.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function permanentlyDelete(): Promise<void> {
    if (
      !window.confirm(
        `Permanently delete Room ${room.number}?\n\nThis is only allowed when the room has never been used. This cannot be undone.`,
      )
    ) {
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      await apiRequest(`/rooms/${room.id}`, { method: 'DELETE' });
      await onSaved();
    } catch (error: unknown) {
      setMessage(
        error instanceof Error ? error.message : 'Room could not be deleted.',
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
        aria-labelledby="edit-room-title"
      >
        <div className="dialog-header">
          <div>
            <p className="dialog-eyebrow">Room management</p>
            <h2 id="edit-room-title">Edit Room {room.number}</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <form onSubmit={(event) => void save(event)}>
          <label>
            Room name or number
            <input
              required
              maxLength={30}
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
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Display order
            <input
              required
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              value={displayOrder}
              onChange={(event) => setDisplayOrder(event.target.value)}
            />
          </label>
          <label>
            Room status
            <select
              value={operationalStatus}
              onChange={(event) =>
                setOperationalStatus(event.target.value as OperationalStatus)
              }
            >
              <option value="ACTIVE">Available</option>
              <option value="CLEANING">Cleaning</option>
              <option value="MAINTENANCE">Maintenance</option>
              <option value="INACTIVE">Archived</option>
            </select>
          </label>
          <p className="form-help">
            Name and room-type changes also update the room label shown in
            linked history. Previously charged amounts remain unchanged.
          </p>
          {message && <p className="form-error">{message}</p>}
          <div className="dialog-actions split-actions">
            <button
              className="danger-button"
              type="button"
              disabled={saving}
              onClick={() => void permanentlyDelete()}
            >
              Permanently delete
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={onClose}
            >
              Cancel
            </button>
            <button className="primary-button" type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
