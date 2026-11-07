import { CalendarDays, Clock3 } from 'lucide-react';

export function DateTimeField({ label, value, onChange, disabled, min, required }: {
  label: string; value: string; onChange: (value: string) => void; disabled?: boolean; min?: string; required?: boolean;
}) {
  const [date = '', time = ''] = value.split('T');
  const complete = required || !!value;
  return <fieldset className="date-time-field" disabled={disabled}>
    <legend>{label}</legend>
    <div className="date-time-inputs">
      <label><span><CalendarDays size={15} aria-hidden="true"/>날짜</span>
        <input type="date" aria-label={`${label} 날짜`} required={complete} min={min?.slice(0, 10)} value={date} onChange={event => onChange(event.target.value || time ? `${event.target.value}T${time}` : '')}/>
      </label>
      <label><span><Clock3 size={15} aria-hidden="true"/>시간</span>
        <input type="time" aria-label={`${label} 시간`} required={complete} min={date && date === min?.slice(0, 10) ? min.slice(11) : undefined} value={time} onChange={event => onChange(date || event.target.value ? `${date}T${event.target.value}` : '')}/>
      </label>
    </div>
    {!required && value && <button type="button" className="text-button" onClick={() => onChange('')}>날짜·시간 지우기</button>}
  </fieldset>;
}
