import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  LogIn,
  Pencil,
  Plus,
  X,
} from 'lucide-react';
import { apiRequest } from './api';

type BookingStatus =
  'PENDING' | 'CONFIRMED' | 'ARRIVED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
type ArrivalType = 'VEHICLE' | 'WALK_IN';
type VehicleType = 'MOTORCYCLE' | 'CAR' | 'VAN' | 'TRICYCLE' | 'OTHER_VEHICLE';

interface BookingRoom {
  id: number;
  number: string;
  operationalStatus: 'ACTIVE' | 'CLEANING' | 'MAINTENANCE' | 'INACTIVE';
  stays: unknown[];
  roomType: {
    name: string;
    rates: { id: number; durationHours: number; amountCentavos: number }[];
  };
  rateOverrides: {
    id: number;
    roomId: number;
    durationHours: number;
    amountCentavos: number;
  }[];
}

function effectiveRoomRate(room: BookingRoom, durationHours: number) {
  return (
    (room.rateOverrides ?? []).find(
      (rate) => rate.durationHours === durationHours,
    ) ??
    room.roomType.rates.find((rate) => rate.durationHours === durationHours)
  );
}

interface Booking {
  id: number;
  bookingDate: string;
  estimatedArrivalAt: string | null;
  roomId: number | null;
  room: BookingRoom | null;
  expectedDurationHours: number;
  numberOfDays?: number | null;
  guestName: string | null;
  contactNumber: string | null;
  arrivalType: ArrivalType | null;
  vehicleType: VehicleType | null;
  plateNumber: string | null;
  bookingReference: string | null;
  notes: string | null;
  status: BookingStatus;
  convertedStay: { id: number; status: string } | null;
  createdBy: { id: number; username: string };
}

interface BookingFormValue {
  bookingDate: string;
  estimatedArrivalAt: string;
  roomId: string;
  expectedDurationHours: string;
  numberOfDays: string;
  guestName: string;
  contactNumber: string;
  arrivalType: '' | ArrivalType;
  vehicleType: '' | VehicleType;
  plateNumber: string;
  bookingReference: string;
  notes: string;
}

const statuses: Record<BookingStatus, string> = {
  PENDING: 'Pending',
  CONFIRMED: 'Confirmed',
  ARRIVED: 'Arrived',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  NO_SHOW: 'No-show',
};

function localDate(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function moveDate(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return localDate(date);
}

function dateTimeInput(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function formatBookingDate(value: string): string {
  return new Intl.DateTimeFormat('en-PH', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(value));
}

function formatArrival(value: string | null): string {
  if (!value) return 'Arrival time not set';
  return new Intl.DateTimeFormat('en-PH', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function emptyForm(date: string): BookingFormValue {
  return {
    bookingDate: date,
    estimatedArrivalAt: '',
    roomId: '',
    expectedDurationHours: '3',
    numberOfDays: '1',
    guestName: '',
    contactNumber: '',
    arrivalType: '',
    vehicleType: '',
    plateNumber: '',
    bookingReference: '',
    notes: '',
  };
}

function bookingForm(booking: Booking): BookingFormValue {
  return {
    bookingDate: booking.bookingDate.slice(0, 10),
    estimatedArrivalAt: dateTimeInput(booking.estimatedArrivalAt),
    roomId: booking.roomId ? String(booking.roomId) : '',
    expectedDurationHours: booking.numberOfDays
      ? 'DAYS'
      : String(booking.expectedDurationHours),
    numberOfDays: String(booking.numberOfDays ?? 1),
    guestName: booking.guestName ?? '',
    contactNumber: booking.contactNumber ?? '',
    arrivalType: booking.arrivalType ?? '',
    vehicleType: booking.vehicleType ?? '',
    plateNumber: booking.plateNumber ?? '',
    bookingReference: booking.bookingReference ?? '',
    notes: booking.notes ?? '',
  };
}

export function BookingsView({
  rooms,
  onStayCreated,
}: {
  rooms: BookingRoom[];
  onStayCreated: () => Promise<void>;
}) {
  const today = localDate();
  const [selectedDate, setSelectedDate] = useState(today);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [futureBookings, setFutureBookings] = useState<Booking[]>([]);
  const [editing, setEditing] = useState<Booking | 'new' | null>(null);
  const [arriving, setArriving] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const loadBookings = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const requests = [
        apiRequest<{ data: Booking[] }>(`/bookings?date=${selectedDate}`),
      ];
      if (selectedDate === today) {
        requests.push(
          apiRequest<{ data: Booking[] }>(
            `/bookings?from=${moveDate(today, 1)}`,
          ),
        );
      }
      const [selected, future] = await Promise.all(requests);
      setBookings(selected?.data ?? []);
      setFutureBookings(future?.data ?? []);
    } catch (error: unknown) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Bookings could not be loaded.',
      );
    } finally {
      setLoading(false);
    }
  }, [selectedDate, today]);

  useEffect(() => {
    void loadBookings();
  }, [loadBookings]);

  useEffect(() => {
    const refresh = () => void loadBookings();
    window.addEventListener('oha:reconnected', refresh);
    return () => window.removeEventListener('oha:reconnected', refresh);
  }, [loadBookings]);

  async function changeStatus(
    booking: Booking,
    status: 'CONFIRMED' | 'CANCELLED' | 'NO_SHOW',
  ): Promise<void> {
    const verb = status === 'CANCELLED' ? 'cancel' : 'mark as no-show';
    if (
      status !== 'CONFIRMED' &&
      !window.confirm(`Are you sure you want to ${verb} this booking?`)
    ) {
      return;
    }
    setMessage(null);
    try {
      await apiRequest(`/bookings/${booking.id}/status`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      });
      await loadBookings();
    } catch (error: unknown) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'The booking could not be updated.',
      );
    }
  }

  return (
    <section>
      <div className="page-heading">
        <div>
          <h2>Bookings</h2>
          <p>Upcoming arrivals and room assignments</p>
        </div>
        <button
          className="primary-button command-button"
          type="button"
          onClick={() => setEditing('new')}
        >
          <Plus size={18} aria-hidden="true" />
          Add booking
        </button>
      </div>

      <div className="booking-date-toolbar">
        <button
          className="icon-button"
          type="button"
          title="Previous day"
          aria-label="Previous day"
          onClick={() => setSelectedDate(moveDate(selectedDate, -1))}
        >
          <ChevronLeft size={20} />
        </button>
        <label>
          <CalendarDays size={18} aria-hidden="true" />
          <span>Date</span>
          <input
            type="date"
            value={selectedDate}
            onChange={(event) => setSelectedDate(event.target.value)}
          />
        </label>
        <button
          className="icon-button"
          type="button"
          title="Next day"
          aria-label="Next day"
          onClick={() => setSelectedDate(moveDate(selectedDate, 1))}
        >
          <ChevronRight size={20} />
        </button>
        <button
          className="secondary-button"
          type="button"
          onClick={() => setSelectedDate(today)}
        >
          Today
        </button>
      </div>

      {message && (
        <p className="form-error" role="alert">
          {message}
        </p>
      )}
      <BookingSection
        title={
          selectedDate === today
            ? "Today's bookings"
            : formatBookingDate(`${selectedDate}T00:00:00.000Z`)
        }
        bookings={bookings}
        loading={loading}
        onEdit={setEditing}
        onArrive={setArriving}
        onStatus={changeStatus}
      />
      {selectedDate === today && (
        <BookingSection
          title="Future bookings"
          bookings={futureBookings}
          loading={loading}
          onEdit={setEditing}
          onArrive={setArriving}
          onStatus={changeStatus}
        />
      )}

      {editing && (
        <BookingDialog
          booking={editing === 'new' ? null : editing}
          initialDate={selectedDate}
          rooms={rooms}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await loadBookings();
          }}
        />
      )}
      {arriving && (
        <ArrivalDialog
          booking={arriving}
          rooms={rooms}
          onClose={() => setArriving(null)}
          onArrived={async () => {
            setArriving(null);
            await Promise.all([loadBookings(), onStayCreated()]);
          }}
        />
      )}
    </section>
  );
}

function BookingSection({
  title,
  bookings,
  loading,
  onEdit,
  onArrive,
  onStatus,
}: {
  title: string;
  bookings: Booking[];
  loading: boolean;
  onEdit: (booking: Booking) => void;
  onArrive: (booking: Booking) => void;
  onStatus: (
    booking: Booking,
    status: 'CONFIRMED' | 'CANCELLED' | 'NO_SHOW',
  ) => Promise<void>;
}) {
  return (
    <div className="booking-section">
      <div className="section-heading">
        <h3>{title}</h3>
        <span>{bookings.length}</span>
      </div>
      {loading ? (
        <p className="empty-state">Loading bookings...</p>
      ) : bookings.length === 0 ? (
        <p className="empty-state">No bookings for this period.</p>
      ) : (
        <div className="booking-grid">
          {bookings.map((booking) => (
            <article className="booking-card" key={booking.id}>
              <div className="booking-card-heading">
                <div>
                  <span
                    className={`booking-status ${booking.status.toLowerCase()}`}
                  >
                    {statuses[booking.status]}
                  </span>
                  <h4>
                    {booking.guestName ||
                      booking.bookingReference ||
                      `Booking #${booking.id}`}
                  </h4>
                </div>
                <strong>
                  {booking.room
                    ? `Room ${booking.room.number}`
                    : 'Room not assigned'}
                </strong>
              </div>
              <dl className="booking-details">
                <div>
                  <dt>Date</dt>
                  <dd>{formatBookingDate(booking.bookingDate)}</dd>
                </div>
                <div>
                  <dt>Arrival</dt>
                  <dd>{formatArrival(booking.estimatedArrivalAt)}</dd>
                </div>
                <div>
                  <dt>Stay</dt>
                  <dd>
                    {booking.numberOfDays
                      ? `${booking.numberOfDays} ${booking.numberOfDays === 1 ? 'day' : 'days'} (${booking.expectedDurationHours} hours)`
                      : `${booking.expectedDurationHours} hours`}
                  </dd>
                </div>
                {booking.contactNumber && (
                  <div>
                    <dt>Contact</dt>
                    <dd>{booking.contactNumber}</dd>
                  </div>
                )}
              </dl>
              {booking.bookingReference && booking.guestName && (
                <p className="booking-reference">
                  Reference: {booking.bookingReference}
                </p>
              )}
              {booking.notes && (
                <p className="booking-notes">{booking.notes}</p>
              )}
              {(booking.status === 'PENDING' ||
                booking.status === 'CONFIRMED') && (
                <div className="booking-actions">
                  <button
                    className="primary-button"
                    type="button"
                    onClick={() => onArrive(booking)}
                  >
                    <LogIn size={16} />
                    Arrived
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => onEdit(booking)}
                  >
                    <Pencil size={16} />
                    Edit
                  </button>
                  {booking.status === 'PENDING' && (
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => void onStatus(booking, 'CONFIRMED')}
                    >
                      <Check size={16} />
                      Confirm
                    </button>
                  )}
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => void onStatus(booking, 'NO_SHOW')}
                  >
                    No-show
                  </button>
                  <button
                    className="danger-text-button"
                    type="button"
                    onClick={() => void onStatus(booking, 'CANCELLED')}
                  >
                    <X size={16} />
                    Cancel
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function BookingDialog({
  booking,
  initialDate,
  rooms,
  onClose,
  onSaved,
}: {
  booking: Booking | null;
  initialDate: string;
  rooms: BookingRoom[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState(() =>
    booking ? bookingForm(booking) : emptyForm(initialDate),
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const durations = useMemo(() => {
    const room = rooms.find((item) => item.id === Number(form.roomId));
    const values = room
      ? room.roomType.rates.map((rate) => rate.durationHours)
      : rooms.flatMap((item) =>
          item.roomType.rates.map((rate) => rate.durationHours),
        );
    return [...new Set(values)].sort((left, right) => left - right);
  }, [form.roomId, rooms]);
  const selectedRoom = rooms.find((item) => item.id === Number(form.roomId));
  const supportsDays = selectedRoom
    ? Boolean(effectiveRoomRate(selectedRoom, 24))
    : rooms.some((room) => Boolean(effectiveRoomRate(room, 24)));
  const isDays = form.expectedDurationHours === 'DAYS';
  const parsedDays = Number(form.numberOfDays);
  const daysAreValid =
    Number.isInteger(parsedDays) && parsedDays >= 1 && parsedDays <= 365;
  const totalDurationHours = isDays
    ? daysAreValid
      ? parsedDays * 24
      : 0
    : Number(form.expectedDurationHours);
  const dayRate = selectedRoom
    ? effectiveRoomRate(selectedRoom, 24)
    : undefined;
  const expectedEnd =
    form.estimatedArrivalAt && totalDurationHours > 0
      ? new Date(
          new Date(form.estimatedArrivalAt).getTime() +
            totalDurationHours * 60 * 60 * 1000,
        )
      : null;

  useEffect(() => {
    if (
      durations.length > 0 &&
      form.expectedDurationHours !== 'DAYS' &&
      !durations.includes(Number(form.expectedDurationHours))
    ) {
      setForm((current) => ({
        ...current,
        expectedDurationHours: String(durations[0]),
      }));
    }
  }, [durations, form.expectedDurationHours]);

  function setField<K extends keyof BookingFormValue>(
    key: K,
    value: BookingFormValue[K],
  ): void {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await apiRequest(booking ? `/bookings/${booking.id}` : '/bookings', {
        method: booking ? 'PATCH' : 'POST',
        body: JSON.stringify({
          bookingDate: form.bookingDate,
          estimatedArrivalAt: form.estimatedArrivalAt
            ? new Date(form.estimatedArrivalAt).toISOString()
            : null,
          roomId: form.roomId ? Number(form.roomId) : null,
          expectedDurationHours: totalDurationHours,
          ...(isDays ? { numberOfDays: parsedDays } : {}),
          guestName: form.guestName,
          contactNumber: form.contactNumber,
          arrivalType: form.arrivalType || null,
          vehicleType:
            form.arrivalType === 'VEHICLE' ? form.vehicleType || null : null,
          plateNumber: form.arrivalType === 'VEHICLE' ? form.plateNumber : null,
          bookingReference: form.bookingReference,
          notes: form.notes,
        }),
      });
      await onSaved();
    } catch (error: unknown) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'The booking could not be saved.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        className="dialog booking-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="booking-dialog-title"
      >
        <div className="dialog-header">
          <div>
            <p className="dialog-eyebrow">Reservation</p>
            <h2 id="booking-dialog-title">
              {booking ? 'Edit booking' : 'Add booking'}
            </h2>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label="Close"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <form onSubmit={(event) => void submit(event)}>
          <div className="form-grid">
            <label>
              Booking date
              <input
                required
                type="date"
                value={form.bookingDate}
                onChange={(event) =>
                  setField('bookingDate', event.target.value)
                }
              />
            </label>
            <label>
              Estimated arrival <span className="optional">Optional</span>
              <input
                type="datetime-local"
                value={form.estimatedArrivalAt}
                onChange={(event) =>
                  setField('estimatedArrivalAt', event.target.value)
                }
              />
            </label>
            <label>
              Room <span className="optional">Optional</span>
              <select
                value={form.roomId}
                onChange={(event) => setField('roomId', event.target.value)}
              >
                <option value="">Room not assigned</option>
                {rooms
                  .filter((room) => room.operationalStatus === 'ACTIVE')
                  .map((room) => (
                    <option key={room.id} value={room.id}>
                      Room {room.number} · {room.roomType.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Expected stay
              <select
                required
                value={form.expectedDurationHours}
                onChange={(event) =>
                  setField('expectedDurationHours', event.target.value)
                }
              >
                {durations.map((duration) => (
                  <option key={duration} value={duration}>
                    {duration} hours
                  </option>
                ))}
                {supportsDays && <option value="DAYS">Days</option>}
              </select>
            </label>
            {isDays && (
              <label>
                Number of days
                <input
                  required
                  type="number"
                  min={1}
                  max={365}
                  step={1}
                  inputMode="numeric"
                  value={form.numberOfDays}
                  onChange={(event) =>
                    setField('numberOfDays', event.target.value)
                  }
                />
              </label>
            )}
            {isDays && daysAreValid && (
              <div className="stay-calculation">
                <span>Total duration: {totalDurationHours} hours</span>
                {dayRate ? (
                  <>
                    <span>
                      24-hour rate: ₱
                      {(dayRate.amountCentavos / 100).toLocaleString('en-PH')}
                    </span>
                    <span>
                      Estimated total: ₱
                      {(
                        (dayRate.amountCentavos * parsedDays) /
                        100
                      ).toLocaleString('en-PH')}
                    </span>
                  </>
                ) : (
                  <span>Price will be determined by the assigned room.</span>
                )}
                {expectedEnd && (
                  <span>
                    Expected end: {expectedEnd.toLocaleString('en-PH')}
                  </span>
                )}
              </div>
            )}
            <label>
              Guest name <span className="optional">Optional</span>
              <input
                maxLength={100}
                value={form.guestName}
                onChange={(event) => setField('guestName', event.target.value)}
              />
            </label>
            <label>
              Contact number <span className="optional">Optional</span>
              <input
                maxLength={30}
                value={form.contactNumber}
                onChange={(event) =>
                  setField('contactNumber', event.target.value)
                }
              />
            </label>
            <label>
              Arrival type <span className="optional">Optional</span>
              <select
                value={form.arrivalType}
                onChange={(event) =>
                  setField(
                    'arrivalType',
                    event.target.value as BookingFormValue['arrivalType'],
                  )
                }
              >
                <option value="">Not recorded</option>
                <option value="WALK_IN">Walk-in</option>
                <option value="VEHICLE">Vehicle</option>
              </select>
            </label>
            {form.arrivalType === 'VEHICLE' && (
              <>
                <label>
                  Vehicle type <span className="optional">Optional</span>
                  <select
                    value={form.vehicleType}
                    onChange={(event) =>
                      setField(
                        'vehicleType',
                        event.target.value as BookingFormValue['vehicleType'],
                      )
                    }
                  >
                    <option value="">Not recorded</option>
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
                    value={form.plateNumber}
                    onChange={(event) =>
                      setField('plateNumber', event.target.value.toUpperCase())
                    }
                  />
                </label>
              </>
            )}
            <label>
              Booking reference <span className="optional">Optional</span>
              <input
                maxLength={50}
                value={form.bookingReference}
                onChange={(event) =>
                  setField('bookingReference', event.target.value)
                }
              />
            </label>
          </div>
          <label>
            Notes <span className="optional">Optional</span>
            <textarea
              rows={3}
              maxLength={500}
              value={form.notes}
              onChange={(event) => setField('notes', event.target.value)}
            />
          </label>
          {message && (
            <p className="form-error" role="alert">
              {message}
            </p>
          )}
          <div className="dialog-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              className="primary-button"
              disabled={
                saving ||
                (durations.length === 0 && !supportsDays) ||
                (isDays && !daysAreValid)
              }
            >
              {saving ? 'Saving...' : 'Save booking'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function ArrivalDialog({
  booking,
  rooms,
  onClose,
  onArrived,
}: {
  booking: Booking;
  rooms: BookingRoom[];
  onClose: () => void;
  onArrived: () => Promise<void>;
}) {
  const availableRooms = rooms.filter(
    (room) =>
      room.operationalStatus === 'ACTIVE' &&
      room.stays.length === 0 &&
      room.roomType.rates.some(
        (rate) =>
          rate.durationHours ===
          (booking.numberOfDays ? 24 : booking.expectedDurationHours),
      ),
  );
  const assignedRoomIsAvailable = availableRooms.some(
    (room) => room.id === booking.roomId,
  );
  const [roomId, setRoomId] = useState(
    String(
      (assignedRoomIsAvailable ? booking.roomId : availableRooms[0]?.id) ?? '',
    ),
  );
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'GCASH' | 'CARD'>(
    'CASH',
  );
  const [arrivalType, setArrivalType] = useState<ArrivalType>(
    booking.arrivalType ?? 'WALK_IN',
  );
  const [vehicleType, setVehicleType] = useState<VehicleType | ''>(
    booking.vehicleType ?? '',
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const selectedRoom = availableRooms.find(
    (room) => room.id === Number(roomId),
  );
  const rate = selectedRoom
    ? effectiveRoomRate(
        selectedRoom,
        booking.numberOfDays ? 24 : booking.expectedDurationHours,
      )
    : undefined;
  const totalAmountCentavos = rate
    ? rate.amountCentavos * (booking.numberOfDays ?? 1)
    : null;

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await apiRequest(`/bookings/${booking.id}/arrive`, {
        method: 'POST',
        body: JSON.stringify({
          roomId: Number(roomId),
          paymentMethod,
          arrivalType,
          vehicleType: arrivalType === 'VEHICLE' ? vehicleType || null : null,
        }),
      });
      await onArrived();
    } catch (error: unknown) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'The booking could not be checked in.',
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
        aria-labelledby="arrival-title"
      >
        <div className="dialog-header">
          <div>
            <p className="dialog-eyebrow">
              {booking.guestName ||
                booking.bookingReference ||
                `Booking #${booking.id}`}
            </p>
            <h2 id="arrival-title">Booking arrival</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label="Close"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <form onSubmit={(event) => void submit(event)}>
          <label>
            Room
            <select
              required
              value={roomId}
              onChange={(event) => setRoomId(event.target.value)}
            >
              <option value="">Select room</option>
              {availableRooms.map((room) => (
                <option key={room.id} value={room.id}>
                  Room {room.number} · {room.roomType.name}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="segmented-field">
            <legend>Arrival</legend>
            <div>
              <button
                type="button"
                className={arrivalType === 'WALK_IN' ? 'active' : ''}
                onClick={() => setArrivalType('WALK_IN')}
              >
                Walk-in
              </button>
              <button
                type="button"
                className={arrivalType === 'VEHICLE' ? 'active' : ''}
                onClick={() => setArrivalType('VEHICLE')}
              >
                Vehicle
              </button>
            </div>
          </fieldset>
          {arrivalType === 'VEHICLE' && (
            <label>
              Vehicle type <span className="optional">Optional</span>
              <select
                value={vehicleType}
                onChange={(event) =>
                  setVehicleType(event.target.value as VehicleType | '')
                }
              >
                <option value="">Not recorded</option>
                <option value="MOTORCYCLE">Motorcycle</option>
                <option value="CAR">Car</option>
                <option value="VAN">Van</option>
                <option value="TRICYCLE">Tricycle</option>
                <option value="OTHER_VEHICLE">Other vehicle</option>
              </select>
            </label>
          )}
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
                ? new Intl.NumberFormat('en-PH', {
                    style: 'currency',
                    currency: 'PHP',
                    minimumFractionDigits: 0,
                  }).format(totalAmountCentavos / 100)
                : 'Select an eligible room'}
            </strong>
            <small>The current room rate will be saved with this stay.</small>
          </div>
          {message && (
            <p className="form-error" role="alert">
              {message}
            </p>
          )}
          <div className="dialog-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={onClose}
            >
              Cancel
            </button>
            <button className="primary-button" disabled={saving || !rate}>
              {saving ? 'Checking in...' : 'Confirm arrival'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
