import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Calendar } from 'lucide-react';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import { motion } from 'motion/react';
import { addMonths, endOfMonth, format, startOfMonth, subMonths } from 'date-fns';

interface BookingFormData {
  username: string;
  phone: string;
  reason: string;
  date: string;
  startTime: string;
  endTime: string;
}

interface Booking {
  id: string;
  username: string;
  phone: string;
  reason: string;
  start: Date;
  end: Date;
  isAllDay?: boolean;
  source: 'website' | 'google';
}

interface GoogleCalendarEvent {
  id: string;
  summary?: string;
  description?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
}

const timeOptions = Array.from({ length: 24 }, (_, hour) =>
  [0, 30].map((minute) => {
    const value = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    return {
      value,
      label: format(new Date(2026, 0, 1, hour, minute), 'hh:mm a'),
    };
  }),
)
  .flat()
  .filter((option) => option.value >= '07:30' && option.value <= '17:00');

function TimePickerField({
  id,
  label,
  value,
  error,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedLabel = value ? timeOptions.find((option) => option.value === value)?.label || value : `Select ${label.toLowerCase()}`;

  return (
    <div>
      <label htmlFor={id} className="block mb-2 text-foreground">
        {label}
      </label>
      <button
        id={id}
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full min-h-14 items-center justify-between rounded-md border border-input bg-input-background px-4 py-3 text-left text-base text-foreground transition-all hover:border-primary/50 focus:outline-none focus:ring-2 focus:ring-ring"
      >
        <span>{selectedLabel}</span>
        <span className="text-muted-foreground">Select</span>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{label}</p>
                <h3 className="text-xl text-foreground">{selectedLabel}</h3>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md border border-border px-3 py-2 text-sm text-foreground transition-all hover:border-primary hover:text-primary"
              >
                Close
              </button>
            </div>
            <div className="mb-3 rounded-xl border border-border bg-background/60 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Working Hours</p>
              <p className="mt-1 text-sm text-foreground">Choose a time between 7:30 AM and 5:00 PM.</p>
            </div>
            <div className="rounded-xl border border-border bg-background/50 p-2 shadow-inner">
              <div className="time-picker-scroll grid max-h-72 grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
                {timeOptions.map((option) => {
                  const active = option.value === value;
                  return (
                    <button
                      key={`${id}-${option.value}`}
                      type="button"
                      onClick={() => {
                        onChange(option.value);
                        setOpen(false);
                      }}
                      className={`min-h-11 rounded-md border px-3 py-2 text-sm transition-all ${
                        active
                          ? 'border-primary bg-primary text-primary-foreground shadow-md shadow-primary/30'
                          : 'border-border bg-muted text-foreground hover:border-primary/50 hover:bg-muted/80'
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
      {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
    </div>
  );
}

function toDateTime(date: string, time: string) {
  return new Date(`${date}T${time}:00`);
}

function formatTimeRange(booking: Booking) {
  if (booking.isAllDay) {
    return 'All day';
  }

  return `${format(booking.start, 'HH:mm')} - ${format(booking.end, 'HH:mm')}`;
}

function extractPhone(description?: string) {
  if (!description) {
    return '';
  }

  const match = description.match(/Phone:\s*(.+)/i);
  return match?.[1]?.trim() || '';
}

function eventToBooking(event: GoogleCalendarEvent): Booking | null {
  if (!event.start?.date && !event.start?.dateTime) {
    return null;
  }

  const isAllDay = Boolean(event.start.date && !event.start.dateTime);
  const start = new Date(event.start.dateTime || `${event.start.date}T00:00:00`);
  const end = new Date(event.end?.dateTime || `${event.end?.date || event.start.date}T23:59:00`);

  return {
    id: event.id,
    username: event.summary || 'Reservation',
    phone: extractPhone(event.description),
    reason: event.description || '',
    start,
    end,
    isAllDay,
    source: 'google',
  };
}

function buildEventsRange(date: Date) {
  const windowStart = startOfMonth(subMonths(date, 1));
  const windowEnd = endOfMonth(addMonths(date, 2));

  return {
    timeMin: windowStart.toISOString(),
    timeMax: windowEnd.toISOString(),
  };
}

function formatDisplayDate(date: Date) {
  return format(date, 'd/M/yyyy');
}

function parseFormDate(value: string) {
  if (!value) {
    return null;
  }

  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) {
    return null;
  }

  return new Date(year, month - 1, day);
}

export default function App() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [calendarStatus, setCalendarStatus] = useState<string | null>(null);
  const [submitStatus, setSubmitStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSyncingCalendar, setIsSyncingCalendar] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    setValue,
    watch,
    formState: { errors },
  } = useForm<BookingFormData>();

  const dateField = register('date', { required: 'Date is required' });
  const dateValue = watch('date');
  const startTimeValue = watch('startTime');
  const endTimeValue = watch('endTime');

  useEffect(() => {
    if (!selectedDate) {
      return;
    }

    const formattedDate = format(selectedDate, 'yyyy-MM-dd');
    if (dateValue !== formattedDate) {
      setValue('date', formattedDate, { shouldDirty: true });
    }
  }, [dateValue, selectedDate, setValue]);

  const syncGoogleCalendar = async (date: Date) => {
    const { timeMin, timeMax } = buildEventsRange(date);
    setIsSyncingCalendar(true);

    try {
      const response = await fetch(
        `/api/calendar/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`,
      );
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || 'Unable to read Google Calendar events.');
      }

      const syncedBookings = (payload.items || [])
        .map(eventToBooking)
        .filter((booking: Booking | null): booking is Booking => booking !== null);

      setBookings(syncedBookings);
      setCalendarStatus(
        syncedBookings.length > 0
          ? `Synced ${syncedBookings.length} Google Calendar event${syncedBookings.length === 1 ? '' : 's'}.`
          : null,
      );
    } catch (error) {
      setBookings([]);
      setCalendarStatus(error instanceof Error ? error.message : 'Google Calendar sync failed.');
    } finally {
      setIsSyncingCalendar(false);
    }
  };

  useEffect(() => {
    syncGoogleCalendar(selectedDate || new Date());
  }, [selectedDate]);

  const onSubmit = async (data: BookingFormData) => {
    const start = toDateTime(data.date, data.startTime);
    const end = toDateTime(data.date, data.endTime);

    if (end <= start) {
      setError('endTime', {
        type: 'validate',
        message: 'End time must be later than start time.',
      });
      return;
    }

    setIsSubmitting(true);
    setSubmitStatus(null);

    try {
      const response = await fetch('/api/calendar/reservations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: data.username,
          phone: data.phone,
          reason: data.reason,
          start: start.toISOString(),
          end: end.toISOString(),
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || 'Unable to create reservation.');
      }

      setSelectedDate(start);
      await syncGoogleCalendar(start);
      reset();
      setSubmitStatus('Reservation created on the website and added to Google Calendar.');
    } catch (error) {
      setSubmitStatus(error instanceof Error ? error.message : 'Unable to create reservation.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedDayBookings = bookings.filter(
    (booking) =>
      selectedDate && format(booking.start, 'yyyy-MM-dd') === format(selectedDate, 'yyyy-MM-dd'),
  );
  const bookedDates = bookings.map((booking) => booking.start);

  return (
    <div className="min-h-screen bg-background p-4 md:p-8 lg:p-12">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-12 text-center"
        >
          <h1 className="text-5xl md:text-6xl lg:text-7xl mb-4 text-foreground" style={{ fontWeight: 600 }}>
            Stemlab Calendar Booking
          </h1>
        </motion.div>

        <div className="grid lg:grid-cols-2 gap-8 lg:gap-12">
          <motion.section
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="bg-card rounded-lg p-6 md:p-8 border border-border shadow-lg shadow-primary/10"
          >
            <div className="flex items-center gap-3 mb-6">
              <Calendar className="w-6 h-6 text-primary" />
              <h2 className="text-3xl text-foreground">Booking Information</h2>
            </div>

            {calendarStatus && (
              <div className="mb-5 rounded-md border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                <p>{calendarStatus}</p>
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
              <div>
                <label htmlFor="username" className="block mb-2 text-foreground">
                  Full Name
                </label>
                <input
                  id="username"
                  {...register('username', { required: 'Name is required' })}
                  className="w-full px-4 py-3 bg-input-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring transition-all"
                  placeholder="Enter your name"
                />
                {errors.username && <p className="mt-1 text-sm text-destructive">{errors.username.message}</p>}
              </div>

              <div>
                <label htmlFor="phone" className="sr-only">
                  Phone Number
                </label>
                <input
                  id="phone"
                  type="tel"
                  {...register('phone', { required: 'Phone number is required' })}
                  className="w-full px-4 py-3 bg-input-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring transition-all"
                  placeholder="Enter Your Number"
                />
                {errors.phone && <p className="mt-1 text-sm text-destructive">{errors.phone.message}</p>}
              </div>

              <div>
                <label htmlFor="reason" className="block mb-2 text-foreground">
                  Reason for Visit
                </label>
                <textarea
                  id="reason"
                  {...register('reason', { required: 'Please provide a reason' })}
                  className="w-full px-4 py-3 bg-input-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring transition-all resize-none"
                  placeholder="Brief description of your appointment"
                  rows={3}
                />
                {errors.reason && <p className="mt-1 text-sm text-destructive">{errors.reason.message}</p>}
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="md:col-span-1">
                  <label htmlFor="date" className="block mb-2 text-foreground">
                    Date
                  </label>
                  <input type="hidden" {...dateField} />
                  <button
                    id="date"
                    type="button"
                    onClick={() => setDatePickerOpen(true)}
                    className="flex w-full min-h-14 items-center justify-between rounded-md border border-input bg-input-background px-4 py-3 text-left text-base text-foreground transition-all hover:border-primary/50 focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <span>{dateValue && parseFormDate(dateValue) ? formatDisplayDate(parseFormDate(dateValue)!) : 'Select date'}</span>
                    <span className="text-muted-foreground">Pick</span>
                  </button>
                  {errors.date && <p className="mt-1 text-sm text-destructive">{errors.date.message}</p>}
                </div>

                <input type="hidden" {...register('startTime', { required: 'Start time is required' })} />
                <TimePickerField
                  id="startTime"
                  label="From"
                  value={startTimeValue || ''}
                  error={errors.startTime?.message}
                  onChange={(value) => setValue('startTime', value, { shouldValidate: true, shouldDirty: true })}
                />

                <input type="hidden" {...register('endTime', { required: 'End time is required' })} />
                <TimePickerField
                  id="endTime"
                  label="Until"
                  value={endTimeValue || ''}
                  error={errors.endTime?.message}
                  onChange={(value) => setValue('endTime', value, { shouldValidate: true, shouldDirty: true })}
                />
              </div>

              {submitStatus && (
                <p className="rounded-md border border-border bg-muted/40 px-4 py-3 text-sm text-foreground">
                  {submitStatus}
                </p>
              )}

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-primary text-primary-foreground py-4 rounded-md hover:opacity-90 transition-all shadow-lg shadow-primary/30 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? 'Saving Reservation...' : 'Reserve Appointment'}
              </motion.button>
            </form>
          </motion.section>

          <motion.section
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="bg-card rounded-lg p-6 md:p-8 border border-border shadow-lg shadow-primary/10"
          >
            <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <h2 className="text-3xl text-foreground">Calendar View</h2>
              <button
                type="button"
                onClick={() => syncGoogleCalendar(selectedDate || new Date())}
                disabled={isSyncingCalendar}
                className="rounded-md border border-border px-4 py-2 text-sm text-foreground transition-all hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSyncingCalendar ? 'Syncing...' : 'Refresh Calendar'}
              </button>
            </div>

            <div className="calendar-wrapper mb-6">
              <DayPicker
                mode="single"
                selected={selectedDate}
                onSelect={(date) => {
                  setSelectedDate(date);
                  if (date) {
                    setValue('date', format(date, 'yyyy-MM-dd'), { shouldDirty: true, shouldValidate: true });
                  }
                }}
                modifiers={{ booked: bookedDates }}
                modifiersStyles={{
                  booked: {
                    backgroundColor: 'var(--accent)',
                    color: 'var(--accent-foreground)',
                    fontWeight: 600,
                  },
                }}
                className="mx-auto"
                styles={{
                  caption: { color: 'var(--primary)' },
                  head_cell: { color: 'var(--muted-foreground)' },
                  cell: { padding: '0.5rem' },
                }}
              />
            </div>

            <div className="border-t border-border pt-6">
              <h3 className="text-xl text-foreground mb-4">
                {selectedDate ? formatDisplayDate(selectedDate) : 'Select a Date'}
              </h3>

              {selectedDayBookings.length > 0 ? (
                <div className="space-y-3">
                  {selectedDayBookings.map((booking, index) => (
                    <motion.div
                      key={booking.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className="bg-muted rounded-md p-4 border border-border hover:border-primary/50 transition-all"
                    >
                      <div className="flex justify-between items-start gap-3 mb-2">
                        <div>
                          <p className="font-medium text-foreground">{booking.username}</p>
                          {booking.phone && <p className="text-xs text-muted-foreground">{booking.phone}</p>}
                        </div>
                        <span className="text-sm px-3 py-1 bg-primary text-primary-foreground rounded-full shadow-md shadow-primary/30 whitespace-nowrap">
                          {formatTimeRange(booking)}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">{booking.reason}</p>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground italic">No appointments scheduled for this day.</p>
              )}
            </div>
          </motion.section>
        </div>
      </div>

      {datePickerOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Date</p>
                <h3 className="text-xl text-foreground">
                  {selectedDate ? formatDisplayDate(selectedDate) : 'Select date'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setDatePickerOpen(false)}
                className="rounded-md border border-border px-3 py-2 text-sm text-foreground transition-all hover:border-primary hover:text-primary"
              >
                Close
              </button>
            </div>
            <div className="rounded-xl border border-border bg-background/50 p-3">
              <DayPicker
                mode="single"
                selected={selectedDate}
                onSelect={(date) => {
                  setSelectedDate(date);
                  if (date) {
                    setValue('date', format(date, 'yyyy-MM-dd'), { shouldDirty: true, shouldValidate: true });
                    setDatePickerOpen(false);
                  }
                }}
                className="mx-auto date-picker-popup"
                styles={{
                  months: { display: 'flex', justifyContent: 'center' },
                  month: { margin: '0 auto' },
                  caption: { color: 'var(--primary)', justifyContent: 'space-between', alignItems: 'center' },
                  caption_label: { margin: '0 auto', textAlign: 'center', width: '100%' },
                  nav: { display: 'flex', gap: '0.5rem' },
                  head_row: { justifyContent: 'center' },
                  row: { justifyContent: 'center' },
                  head_cell: { color: 'var(--muted-foreground)', width: '2.75rem', textAlign: 'center' },
                  cell: { padding: '0.35rem', textAlign: 'center' },
                  day: { width: '2.75rem', height: '2.75rem', margin: '0 auto' },
                }}
              />
            </div>
          </div>
        </div>
      )}

      <style>{`
        .calendar-wrapper .rdp {
          --rdp-accent-color: var(--primary);
          --rdp-background-color: var(--muted);
          color: var(--foreground);
        }

        .calendar-wrapper .rdp-button:hover:not([disabled]):not(.rdp-day_selected) {
          background-color: var(--muted);
        }

        .calendar-wrapper .rdp-day_selected {
          background-color: var(--primary);
          color: var(--primary-foreground);
          box-shadow: 0 0 15px rgba(74, 158, 255, 0.4);
        }

        .calendar-wrapper .rdp-day_today {
          font-weight: 600;
          color: var(--primary);
          border: 1px solid var(--primary);
        }

        .calendar-wrapper .rdp-caption {
          color: var(--foreground);
        }

        .calendar-wrapper .rdp-head_cell {
          color: var(--muted-foreground);
        }

        .date-picker-popup .rdp-months,
        .date-picker-popup .rdp-month,
        .date-picker-popup .rdp-table {
          margin-inline: auto;
        }

        .date-picker-popup .rdp-table {
          width: auto;
        }

        .date-picker-popup .rdp-caption {
          width: 100%;
        }

        .date-picker-popup .rdp-nav {
          margin-left: auto;
        }

        .time-picker-scroll {
          scrollbar-width: thin;
          scrollbar-color: rgba(74, 158, 255, 0.65) rgba(255, 255, 255, 0.05);
        }

        .time-picker-scroll::-webkit-scrollbar {
          width: 10px;
        }

        .time-picker-scroll::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 999px;
        }

        .time-picker-scroll::-webkit-scrollbar-thumb {
          background: linear-gradient(180deg, rgba(74, 158, 255, 0.95), rgba(61, 90, 128, 0.95));
          border-radius: 999px;
          border: 2px solid transparent;
          background-clip: padding-box;
        }

        .time-picker-scroll::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(180deg, rgba(102, 177, 255, 0.98), rgba(74, 158, 255, 0.98));
          background-clip: padding-box;
        }
      `}</style>
    </div>
  );
}
