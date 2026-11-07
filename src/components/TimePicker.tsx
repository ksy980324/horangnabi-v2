const hours = Array.from({ length: 24 }, (_, value) => String(value).padStart(2, '0'));
const minutes = Array.from({ length: 60 }, (_, value) => String(value).padStart(2, '0'));

export function TimePicker({ label, value, onChange, required, min }: {
  label: string; value: string; onChange: (value: string) => void; required?: boolean; min?: string;
}) {
  const [hour = '', minute = ''] = value.split(':');
  const complete = required || !!value;
  function change(nextHour: string, nextMinute: string) {
    onChange(nextHour || nextMinute ? `${nextHour}:${nextMinute}` : '');
  }
  return <div className="time-picker" role="group" aria-label={label}>
    <select aria-label={`${label} 시`} required={complete} value={hour} onChange={event => change(event.target.value, minute)}>
      <option value="">시</option>
      {hours.map(value => <option key={value} value={value} disabled={!!min && value < min.slice(0, 2)}>{value}시</option>)}
    </select>
    <span aria-hidden="true">:</span>
    <select aria-label={`${label} 분`} required={complete} value={minute} onChange={event => change(hour, event.target.value)}>
      <option value="">분</option>
      {minutes.map(value => <option key={value} value={value} disabled={!!min && hour === min.slice(0, 2) && value < min.slice(3)}>{value}분</option>)}
    </select>
  </div>;
}
