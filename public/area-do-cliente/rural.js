import { apiGet, apiPost, apiPatch } from "../shared/supabaseAuth.js";
const el = (id) => document.getElementById(id);
const number = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const node = (tag, text, cls) => {
  const n = document.createElement(tag);
  if (text != null) n.textContent = text;
  if (cls) n.className = cls;
  return n;
};
let selected = "",
  generation = 0;
function status(text, error = false) {
  el("rural-status").textContent = text;
  el("rural-status").classList.toggle("is-error", error);
}
function listSection(title, rows, empty, format, action) {
  const section = node("section");
  section.append(node("h3", title));
  if (!rows.length) section.append(node("p", empty, "muted"));
  else {
    const list = node("ul", null, "rural-list");
    for (const r of rows) {
      const li = node("li");
      li.append(node("span", format(r)));
      if (action) li.append(action(r));
      list.append(li);
    }
    section.append(list);
  }
  return section;
}
function correction(row, entity, key, label, type = "text") {
  const details = node("details", null, "rural-correction");
  details.append(node("summary", "Corrigir"));
  const form = node("form", null, "signup-form");
  const input = node("input");
  input.id = `correct-${row.id}-${key}`;
  input.type = type;
  input.required = true;
  input.value = row[key];
  if (type === "number") {
    input.min = "0.01";
    input.step = "any";
  }
  const lab = node("label", label);
  lab.htmlFor = input.id;
  lab.append(input);
  const button = node("button", "Salvar", "btn-secondary");
  button.type = "submit";
  form.append(lab, button);
  details.append(form);
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    button.disabled = true;
    try {
      await apiPatch(`/api/rural/farms/${selected}/${entity}/${row.id}`, {
        [key]: type === "number" ? Number(input.value) : input.value.trim(),
      });
      await loadFarm();
    } catch (e) {
      status(e.message, true);
    } finally {
      button.disabled = false;
    }
  });
  return details;
}
async function loadFarm() {
  const seq = ++generation;
  el("rural-content").replaceChildren();
  if (!selected) return;
  status("Carregando registros da propriedade…");
  try {
    const { data: s } = await apiGet(`/api/rural/farms/${selected}/summary`);
    if (seq !== generation) return;
    const content = el("rural-content");
    content.append(node("h3", s.farm.name, "rural-farm-name"));
    content.append(
      node(
        "p",
        [s.farm.city, s.farm.state].filter(Boolean).join(" / ") ||
          "Localização ainda não informada.",
        "muted",
      ),
    );
    const dl = node("dl", null, "rural-facts");
    for (const [label, value] of [
      [
        "Área cadastrada",
        s.farm.total_area_ha
          ? `${number.format(s.farm.total_area_ha)} ha`
          : "Ainda não informada",
      ],
      [
        "Safra ativa",
        s.seasons
          .filter((x) => x.status === "active")
          .map((x) => x.name)
          .join(", ") || "Ainda não cadastrada",
      ],
      [
        "Custos registrados",
        s.expenses
          ? money.format(s.expenses.amount)
          : "Financeiro não habilitado",
      ],
    ]) {
      const d = node("div");
      d.append(node("dt", label), node("dd", value));
      dl.append(d);
    }
    content.append(
      dl,
      node(
        "p",
        "Custos de todas as safras. As listas mostram até 50 registros recentes; consulte períodos específicos pelo WhatsApp.",
        "hint",
      ),
    );
    content.append(
      listSection(
        "Avisos",
        s.alerts || [],
        "Nenhum aviso ativo.",
        (a) => `${a.title} · ${a.message}`,
      ),
    );
    content.append(
      listSection(
        "Próximas tarefas",
        s.tasks
          .filter((t) => t.status === "pending")
          .sort((a, b) => Date.parse(a.due_at) - Date.parse(b.due_at)),
        "Nenhuma tarefa pendente nos registros recentes.",
        (t) =>
          `${t.title} · ${new Date(t.due_at).toLocaleString("pt-BR", { timeZone: s.farm.timezone })}`,
        (t) => {
          const b = node("button", "Marcar como feita", "btn-secondary");
          b.type = "button";
          b.addEventListener("click", async () => {
            b.disabled = true;
            try {
              await apiPatch(
                `/api/rural/farms/${selected}/farm_tasks/${t.id}`,
                { status: "completed" },
              );
              await loadFarm();
            } catch (e) {
              status(e.message, true);
              b.disabled = false;
            }
          });
          return b;
        },
      ),
    );
    content.append(
      listSection(
        "Talhões",
        s.fields,
        "Você ainda não cadastrou talhões. Conte ao AG o nome e a área de cada um.",
        (f) =>
          `${f.name} · ${f.area_ha ? number.format(f.area_ha) + " ha" : "área não informada"}`,
        (f) => correction(f, "fields", "area_ha", "Área em hectares", "number"),
      ),
    );
    content.append(
      listSection(
        "Atividades recentes",
        s.operations,
        "Nenhuma atividade registrada. No WhatsApp, diga o que você fez hoje.",
        (o) =>
          `${o.operation_date.split("-").reverse().join("/")} · ${o.description}`,
      ),
    );
    content.append(
      listSection(
        "Estoque",
        s.inventory,
        "Nenhum item disponível nesta visão.",
        (i) =>
          `${i.name} · ${number.format(i.current_quantity)} ${i.unit}${i.minimum_quantity != null && Number(i.current_quantity) < Number(i.minimum_quantity) ? " · abaixo do mínimo" : ""}`,
      ),
    );
    content.append(
      listSection(
        "Ocorrências",
        s.occurrences,
        "Nenhuma ocorrência disponível nesta visão.",
        (o) =>
          `${o.title} · ${o.status === "resolved" ? "resolvida" : "em acompanhamento"}`,
      ),
    );
    const weather = node("p", "Consultando o clima…", "hint");
    content.append(weather);
    apiGet(`/api/rural/farms/${selected}/weather`)
      .then(({ data: w }) => {
        if (seq !== generation) return;
        weather.textContent = `Clima · ${w.current.temperature_2m} ${w.current_units.temperature_2m}. Chuva prevista: ${w.daily.precipitation_sum.join(" / ")} ${w.daily_units.precipitation_sum} em ${w.daily.time.join(", ")}. Fonte: ${w.source}, consultado em ${new Date(w.retrieved_at).toLocaleString("pt-BR")}.`;
      })
      .catch(() => {
        if (seq === generation)
          weather.textContent =
            "Clima indisponível. Confira se a cidade e a UF estão cadastradas.";
      });
    status(
      "Registros atualizados. Você pode continuar registrando pelo WhatsApp.",
    );
  } catch (e) {
    if (seq === generation)
      status(e.message || "Não foi possível carregar. Tente atualizar.", true);
  }
}
export async function loadRural() {
  try {
    const { data: farms } = await apiGet("/api/rural/farms");
    el("rural-overview").hidden = false;
    const select = el("rural-farm-select");
    select.replaceChildren();
    for (const farm of farms) {
      const option = node("option", farm.name);
      option.value = farm.id;
      select.append(option);
    }
    select.hidden = !farms.length;
    el("rural-create").open = !farms.length;
    selected = farms.some((f) => f.id === selected)
      ? selected
      : farms[0]?.id || "";
    select.value = selected;
    if (!farms.length) {
      el("rural-content").replaceChildren();
      status(
        "Você ainda não cadastrou uma propriedade. Comece pelo nome ou converse com o AG no WhatsApp.",
      );
      return;
    }
    await loadFarm();
  } catch (e) {
    if (e.status === 404 || /ainda não habilitada/.test(e.message))
      el("rural-overview").hidden = true;
    else {
      el("rural-overview").hidden = false;
      status(
        "Não foi possível carregar sua propriedade. Tente atualizar.",
        true,
      );
    }
  }
}
el("rural-farm-select").addEventListener("change", (ev) => {
  selected = ev.target.value;
  void loadFarm();
});
el("rural-refresh").addEventListener("click", () => void loadRural());
el("rural-create-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const button = ev.target.querySelector("button");
  button.disabled = true;
  const values = Object.fromEntries(
    [...new FormData(ev.target)].filter(([, v]) => v.trim()),
  );
  if (values.total_area_ha) values.total_area_ha = Number(values.total_area_ha);
  if (values.state) values.state = values.state.toUpperCase();
  try {
    const { data: farm } = await apiPost("/api/rural/farms", values);
    selected = farm.id;
    ev.target.reset();
    el("rural-create").open = false;
    await loadRural();
  } catch (e) {
    status(e.message, true);
  } finally {
    button.disabled = false;
  }
});
