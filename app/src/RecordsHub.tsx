import { ArrowRight, CalendarDays, ClipboardList, Leaf, MapPinned, Wallet } from 'lucide-react';
import type { DashboardData, Farm } from './api';

export default function RecordsHub({ farm, data, modules, busy, onExpenses, onTasks, onAnimals, onProduction, onOperations }: {
  farm: Farm; data: DashboardData | null; modules: boolean; busy: boolean;
  onExpenses: () => void; onTasks: () => void; onAnimals: () => void; onProduction: () => void; onOperations: () => void;
}) {
  const cards = [
    { title: 'Meus gastos', description: 'Veja cada despesa, o valor e a data.', Icon: Wallet, action: onExpenses, color: 'spending' },
    { title: 'Minhas tarefas', description: 'O que fazer, quando fazer e os lembretes.', Icon: CalendarDays, action: onTasks, color: 'tasks' },
    { title: modules ? 'Meus animais e áreas' : 'Meus talhões e safras', description: modules ? 'Encontre animais, lotes, canteiros e suas fichas.' : 'Veja os cadastros da propriedade.', Icon: MapPinned, action: onAnimals, color: 'animals' },
    ...(modules ? [{ title: 'Minha produção', description: 'Colheitas, leite, ovos e o trabalho realizado.', Icon: Leaf, action: onProduction, color: 'production' }] : []),
    { title: 'Trabalhos do campo', description: 'Manejo, irrigação e outras atividades registradas.', Icon: ClipboardList, action: onOperations, color: 'operations' },
  ];
  return <section className="records-hub" aria-label="Encontrar meus registros">
    <div className="page-heading"><div><span className="dash-eyebrow">{farm.name}</span><h1>Meus registros</h1><p>Escolha o que quer conferir. Os pedidos salvos pela Lida e pelo app ficam juntos aqui.</p></div></div>
    <div className="records-destinations">{cards.map(({ title, description, Icon, action, color }) => <button key={title} className={`records-destination ${color}`} disabled={busy} onClick={action}><span className="destination-icon"><Icon size={23}/></span><span><strong>{title}</strong><small>{description}</small></span><ArrowRight size={19}/></button>)}</div>
    <p className="records-hub-help">Para corrigir, abra o registro. O histórico de alterações fica nos detalhes.{data && <span> Os números do resumo usam o período escolhido no Início.</span>}</p>
  </section>;
}
