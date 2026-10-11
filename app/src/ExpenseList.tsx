import { ChevronRight, Fuel, Leaf, Package, Receipt, ShieldCheck, Sprout, Stethoscope, Users, Wrench } from 'lucide-react';
import type { ActivityChange } from './api';

const categories: Record<string, { label: string; Icon: typeof Fuel }> = {
  combustivel: { label: 'Combustível', Icon: Fuel }, sementes: { label: 'Sementes e mudas', Icon: Sprout },
  fertilizantes: { label: 'Fertilizantes', Icon: Leaf }, defensivos: { label: 'Defensivos', Icon: ShieldCheck },
  racao: { label: 'Ração', Icon: Package }, veterinaria: { label: 'Veterinária', Icon: Stethoscope },
  mao_de_obra: { label: 'Mão de obra', Icon: Users }, manutencao: { label: 'Manutenção', Icon: Wrench }, outros: { label: 'Outros', Icon: Receipt },
};
const money = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
export default function ExpenseList({ rows, disabled, onRecord }: {
  rows: { id: string; description: string; category: string; expense_date: string; amount: number }[];
  disabled: boolean; onRecord?: (change: ActivityChange) => void;
}) {
  return <ul className="expense-ledger">{rows.map(row => {
    const { label, Icon } = categories[row.category] || { label: row.category.replaceAll('_', ' '), Icon: Receipt };
    const contents = <><span className="expense-entry-meta"><span><Icon size={17} aria-hidden="true"/>{label}</span><time dateTime={row.expense_date}>{new Date(`${row.expense_date}T12:00:00`).toLocaleDateString('pt-BR')}</time></span><strong className="expense-entry-description">{row.description}</strong><span className="expense-entry-bottom"><strong className="records-amount">{money(Number(row.amount))}</strong>{onRecord && <span className="expense-entry-details">Ver detalhes <ChevronRight size={16} aria-hidden="true"/></span>}</span></>;
    return <li key={row.id}>{onRecord ? <button type="button" className="expense-entry" disabled={disabled} aria-label={`Abrir ${row.description}`} onClick={() => onRecord({ entity: 'farm_expenses', entity_id: row.id, type: 'updated', label: 'Despesa', title: row.description })}>{contents}</button> : <div className="expense-entry">{contents}</div>}</li>;
  })}</ul>;
}
