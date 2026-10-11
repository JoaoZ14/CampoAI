import { useState } from 'react';

export default function PasswordField({ label, value, onChange, newPassword = false }: {
  label: string; value: string; onChange: (value: string) => void; newPassword?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return <div className="password-field"><label>{label}<input type={visible ? 'text' : 'password'} required autoComplete={newPassword ? 'new-password' : 'current-password'} minLength={newPassword ? 6 : undefined} value={value} onChange={event => onChange(event.target.value)}/></label><button className="text-button" type="button" aria-pressed={visible} onClick={() => setVisible(previous => !previous)}>{visible ? 'Ocultar senha' : 'Mostrar senha'}</button>{newPassword && <small>Use pelo menos 6 caracteres.</small>}</div>;
}
