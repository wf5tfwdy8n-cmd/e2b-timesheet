import React, { useEffect, useMemo, useRef, useState } from "react";

type DayEntry = {
  date: string;
  start: string;
  end: string;
  breakMin: number;
  site?: string;
  task?: string;
  notes?: string;
  night?: boolean;
  travel?: boolean;
};

const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);

function monthKey(ym: string, profile: string) {
  return `timesheet:${profile || "default"}:${ym}`;
}

function daysInMonth(ym: string): string[] {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return Array.from({ length: last }, (_, i) => `${ym}-${pad(i + 1)}`);
}

function hmToMinutes(hm: string): number {
  if (!hm) return 0;
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + (m || 0);
}

function minutesToHM(mins: number): string {
  const sign = mins < 0 ? "-" : "";
  const v = Math.abs(mins);
  const h = Math.floor(v / 60);
  const m = v % 60;
  return `${sign}${pad(h)}:${pad(m)}`;
}

function computeWorkedMinutes(e: DayEntry): number {
  const start = hmToMinutes(e.start);
  const end = hmToMinutes(e.end);
  const raw = end - start - (e.breakMin || 0);
  return Math.max(0, isNaN(raw) ? 0 : raw);
}

function isoWeek(dateStr: string): { year: number; week: number } {
  const date = new Date(dateStr + "T12:00:00");
  const target = new Date(date.valueOf());
  const dayNr = (date.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  const diff = target.valueOf() - firstThursday.valueOf();
  const week = 1 + Math.round(diff / (7 * 24 * 3600 * 1000));
  return { year: target.getFullYear(), week };
}

function toCSV(rows: DayEntry[]) {
  const header = [
    "Date",
    "Début",
    "Fin",
    "Pause(min)",
    "Heures",
    "Site/Chantier",
    "Tâche",
    "Nuit",
    "Déplacement",
    "Notes",
  ];
  const body = rows.map((r) => [
    r.date,
    r.start,
    r.end,
    r.breakMin ?? 0,
    minutesToHM(computeWorkedMinutes(r)),
    r.site || "",
    r.task || "",
    r.night ? "Oui" : "Non",
    r.travel ? "Oui" : "Non",
    (r.notes || "").replace(/\n/g, " "),
  ]);
  return [header, ...body]
    .map((a) => a.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(","))
    .join("\n");
}

interface Profile {
  employee: string;
  company: string;
  defaultBreakMin: number;
  weeklyThreshold: number;
}

const defaultProfile: Profile = {
  employee: "",
  company: "",
  defaultBreakMin: 0,
  weeklyThreshold: 35 * 60,
};

export default function App() {
  const today = new Date();
  const defaultYM = `${today.getFullYear()}-${pad(today.getMonth() + 1)}`;
  const [ym, setYM] = useState<string>(defaultYM);
  const [profile, setProfile] = useState<Profile>(() => {
    try {
      const raw = localStorage.getItem("timesheet:profile");
      return raw ? { ...defaultProfile, ...JSON.parse(raw) } : defaultProfile;
    } catch {
      return defaultProfile;
    }
  });
  const [rows, setRows] = useState<DayEntry[]>(() => {
    try {
      const raw = localStorage.getItem(monthKey(defaultYM, profile.employee));
      if (raw) return JSON.parse(raw);
    } catch {}
    return daysInMonth(defaultYM).map((d) => ({
      date: d,
      start: "",
      end: "",
      breakMin: profile.defaultBreakMin,
    }));
  });
  const [compact, setCompact] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(monthKey(ym, profile.employee));
      if (raw) {
        setRows(JSON.parse(raw));
      } else {
        setRows(
          daysInMonth(ym).map((d) => ({
            date: d,
            start: "",
            end: "",
            breakMin: profile.defaultBreakMin,
          }))
        );
      }
    } catch {}
  }, [ym, profile.employee]);

  useEffect(() => {
    localStorage.setItem("timesheet:profile", JSON.stringify(profile));
    localStorage.setItem(monthKey(ym, profile.employee), JSON.stringify(rows));
  }, [rows, ym, profile]);

  const totals = useMemo(() => {
    const minutes = rows.reduce((acc, r) => acc + computeWorkedMinutes(r), 0);
    const weekly = new Map<string, number>();
    for (const r of rows) {
      if (!r.start || !r.end) continue;
      const { year, week } = isoWeek(r.date);
      const key = `${year}-W${pad(week)}`;
      weekly.set(key, (weekly.get(key) || 0) + computeWorkedMinutes(r));
    }
    const overtimeByWeek: Record<string, number> = {};
    weekly.forEach((v, k) => {
      overtimeByWeek[k] = Math.max(0, v - profile.weeklyThreshold);
    });
    const overtime = Object.values(overtimeByWeek).reduce((a, b) => a + b, 0);
    return { minutes, overtime, weekly: overtimeByWeek };
  }, [rows, profile.weeklyThreshold]);

  function setCell(i: number, patch: Partial<DayEntry>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function clearMonth() {
    if (!confirm("Effacer toutes les entrées du mois ?")) return;
    setRows(
      daysInMonth(ym).map((d) => ({
        date: d,
        start: "",
        end: "",
        breakMin: profile.defaultBreakMin,
      }))
    );
  }

  function copyDown(i: number) {
    const src = rows[i];
    if (!src) return;
    setRows((prev) =>
      prev.map((r, idx) =>
        idx > i && !r.start && !r.end
          ? {
              ...r,
              start: src.start,
              end: src.end,
              breakMin: src.breakMin,
              site: src.site,
              task: src.task,
              night: src.night,
              travel: src.travel,
            }
          : r
      )
    );
  }

  function download(filename: string, data: string, mime: string) {
    const blob = new Blob([data], { type: mime });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function handleImport(file: File) {
    const reader = new FileReader();
    const isXLSX = /xlsx?$/.test(file.name.toLowerCase());
    reader.onload = async (e) => {
      const content = e.target?.result;
      if (!content) return;
      try {
        if (isXLSX && content instanceof ArrayBuffer) {
          const XLSX = await import("xlsx");
          const wb = XLSX.read(content);
          const sheet = wb.Sheets[wb.SheetNames[0]];
          const aoa = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });
          const text = aoa
            .map((row: any[]) =>
              row.map((x) => `"${String(x ?? "").replace(/"/g, '""')}"`).join(",")
            )
            .join("\n");
          mergeImported(parseCSV(text));
        } else if (typeof content === "string") {
          mergeImported(parseCSV(content));
        }
      } catch (e) {
        alert("Impossible d'importer le fichier. Vérifiez le format.");
      }
    };
    if (isXLSX) reader.readAsArrayBuffer(file);
    else reader.readAsText(file, "utf-8");
  }

  function parseCSV(text: string): DayEntry[] {
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (lines.length <= 1) return [];
    const headers = lines[0].split(",").map((h) => h.replace(/^\"|\"$/g, ""));
    const idx = (name: string) =>
      headers.findIndex((h) => h.toLowerCase() === name.toLowerCase());
    const cols = {
      date: idx("Date"),
      start: idx("Début"),
      end: idx("Fin"),
      pause: idx("Pause(min)"),
      site: idx("Site/Chantier"),
      task: idx("Tâche"),
      nuit: idx("Nuit"),
      travel: idx("Déplacement"),
      notes: idx("Notes"),
    };
    return lines.slice(1).map((l) => {
      const parts =
        l.match(/\"([^\"]*(?:\"\"[^\"]*)*)\"(?=,|$)/g)?.map((s) =>
          s.replace(/^\"|\"$/g, "").replace(/\"\"/g, '"')
        ) || l.split(",").map((x) => x.replace(/^\"|\"$/g, ""));
      const get = (i: number) => (i >= 0 ? parts[i] ?? "" : "");
      return {
        date: get(cols.date),
        start: get(cols.start),
        end: get(cols.end),
        breakMin: Number(get(cols.pause) || 0),
        site: get(cols.site),
        task: get(cols.task),
        night: /oui/i.test(get(cols.nuit)),
        travel: /oui/i.test(get(cols.travel)),
        notes: get(cols.notes),
      } as DayEntry;
    });
  }

  const workdays = rows.filter((r) => r.start && r.end);

  // tiny runtime tests
  useEffect(() => {
    console.assert(pad(3) === "03");
    console.assert(hmToMinutes("01:30") === 90);
    console.assert(minutesToHM(90) === "01:30");
  }, []);

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8">
      <header className="flex items-center gap-3 mb-4">
        <div className="w-6 h-6 rounded bg-gray-900"></div>
        <h1 className="text-2xl font-semibold">Pointage d'Heures — {ym}</h1>
        <div className="ml-auto flex items-center gap-2">
          <label className="text-sm">Compact</label>
          <input
            type="checkbox"
            checked={compact}
            onChange={(e) => setCompact(e.target.checked)}
          />
        </div>
      </header>

      <section className="mb-4 bg-white rounded-2xl shadow p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Mois</label>
            <input
              className="border rounded-lg px-3 py-2 w-full"
              type="month"
              value={ym}
              onChange={(e) => setYM(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium">Employé</label>
              <input
                className="border rounded-lg px-3 py-2 w-full"
                placeholder="Nom et prénom"
                value={profile.employee}
                onChange={(e) => setProfile({ ...profile, employee: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Entreprise</label>
              <input
                className="border rounded-lg px-3 py-2 w-full"
                placeholder="Société"
                value={profile.company}
                onChange={(e) => setProfile({ ...profile, company: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Pause par défaut (min)</label>
              <input
                className="border rounded-lg px-3 py-2 w-full"
                type="number"
                min={0}
                value={profile.defaultBreakMin}
                onChange={(e) =>
                  setProfile({ ...profile, defaultBreakMin: Number(e.target.value || 0) })
                }
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Seuil hebdo heures sup (min)</label>
              <input
                className="border rounded-lg px-3 py-2 w-full"
                type="number"
                min={0}
                value={profile.weeklyThreshold}
                onChange={(e) =>
                  setProfile({ ...profile, weeklyThreshold: Number(e.target.value || 0) })
                }
              />
            </div>
          </div>
        </div>
      </section>

      <section className="mb-4 bg-white rounded-2xl shadow">
        <div className="p-4">
          <div className="overflow-x-auto rounded-2xl">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-600">
                  <th className="p-2 whitespace-nowrap">Date</th>
                  <th className="p-2">Jour</th>
                  <th className="p-2">Début</th>
                  <th className="p-2">Fin</th>
                  <th className="p-2">Pause (min)</th>
                  <th className="p-2 whitespace-nowrap">Heures</th>
                  {!compact && <th className="p-2">Site / Chantier</th>}
                  {!compact && <th className="p-2">Tâche</th>}
                  {!compact && <th className="p-2">Nuit</th>}
                  {!compact && <th className="p-2">Dépl.</th>}
                  <th className="p-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const mins = computeWorkedMinutes(r);
                  const dObj = new Date(r.date + "T12:00:00");
                  const wd = isNaN(dObj.getTime()) ? -1 : dObj.getDay();
                  const jour = isNaN(dObj.getTime())
                    ? ""
                    : dObj.toLocaleDateString("fr-FR", { weekday: "long" });
                  const weekendClass = wd === 0 ? "bg-rose-50" : wd === 6 ? "bg-amber-50" : "";
                  const borderClass = r.night
                    ? "border-l-4 border-indigo-300"
                    : r.travel
                    ? "border-l-4 border-teal-300"
                    : "";

                  return (
                    <tr key={r.date} className={`${mins === 0 ? "opacity-70" : ""} ${weekendClass} ${borderClass}`}>
                      <td className="p-2 font-medium">{r.date}</td>
                      <td className="p-2 capitalize">{jour}</td>
                      <td className="p-2">
                        <input className="border rounded px-2 py-1" type="time" value={r.start} onChange={(e) => setCell(i, { start: e.target.value })} />
                      </td>
                      <td className="p-2">
                        <input className="border rounded px-2 py-1" type="time" value={r.end} onChange={(e) => setCell(i, { end: e.target.value })} />
                      </td>
                      <td className="p-2">
                        <input className="border rounded px-2 py-1 w-24" type="number" min={0} value={r.breakMin} onChange={(e) => setCell(i, { breakMin: Number(e.target.value || 0) })} />
                      </td>
                      <td className="p-2 font-mono">{minutesToHM(mins)}</td>
                      {!compact && (
                        <td className="p-2">
                          <input className="border rounded px-2 py-1 w-full" placeholder="Nom du site" value={r.site || ""} onChange={(e) => setCell(i, { site: e.target.value })} />
                        </td>
                      )}
                      {!compact && (
                        <td className="p-2">
                          <input className="border rounded px-2 py-1 w-full" placeholder="Tâche" value={r.task || ""} onChange={(e) => setCell(i, { task: e.target.value })} />
                        </td>
                      )}
                      {!compact && (
                        <td className="p-2">
                          <label className="inline-flex items-center gap-2 text-xs">
                            <span>Oui</span>
                            <input type="checkbox" checked={!!r.night} onChange={(e) => setCell(i, { night: e.target.checked })} />
                          </label>
                        </td>
                      )}
                      {!compact && (
                        <td className="p-2">
                          <label className="inline-flex items-center gap-2 text-xs">
                            <span>Oui</span>
                            <input type="checkbox" checked={!!r.travel} onChange={(e) => setCell(i, { travel: e.target.checked })} />
                          </label>
                        </td>
                      )}
                      <td className="p-2">
                        <div className="flex gap-2">
                          <button className="px-2 py-1 border rounded" title="Copier vers les jours suivants" onClick={() => copyDown(i)}>Copier</button>
                          <details className="px-2 py-1 border rounded">
                            <summary>Notes</summary>
                            <div className="mt-2 grid gap-2">
                              <label className="text-sm">Site / Chantier</label>
                              <input className="border rounded px-2 py-1" value={r.site || ""} onChange={(e) => setCell(i, { site: e.target.value })} />
                              <label className="text-sm">Tâche</label>
                              <input className="border rounded px-2 py-1" value={r.task || ""} onChange={(e) => setCell(i, { task: e.target.value })} />
                              <label className="text-sm">Notes</label>
                              <textarea className="border rounded px-2 py-1" rows={4} value={r.notes || ""} onChange={(e) => setCell(i, { notes: e.target.value })} />
                            </div>
                          </details>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="mb-4 bg-white rounded-2xl shadow p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <div className="text-sm">Total mois</div>
          <div className="text-3xl font-semibold font-mono">{minutesToHM(totals.minutes)}</div>
          <div className="text-sm opacity-80">Heures sup. (cumul) : <span className="font-mono">{minutesToHM(totals.overtime)}</span></div>
        </div>
        <div>
          <div className="text-sm mb-2">Détail par semaine (ISO)</div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {Object.entries(totals.weekly).map(([w, v]) => (
              <div key={w} className="flex justify-between bg-gray-100 rounded-xl px-3 py-2">
                <span>{w}</span>
                <span className="font-mono">{minutesToHM(v)}</span>
              </div>
            ))}
            {Object.keys(totals.weekly).length === 0 && (
              <div className="opacity-70">Renseignez des heures pour voir le détail.</div>
            )}
          </div>
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        <button className="px-3 py-2 rounded bg-gray-900 text-white" onClick={() => download(`pointage_${ym}.csv`, toCSV(workdays), "text/csv")}>
          Export CSV
        </button>
        <label className="px-3 py-2 rounded border cursor-pointer">
          Importer CSV/XLSX
          <input ref={fileInputRef} type="file" accept=".csv, .xls, .xlsx" className="hidden" onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleImport(file);
            (e.currentTarget as HTMLInputElement).value = "";
          }} />
        </label>
        <button className="px-3 py-2 rounded border" onClick={() => localStorage.setItem(monthKey(ym, profile.employee), JSON.stringify(rows))}>
          Sauvegarder
        </button>
        <button className="px-3 py-2 rounded border border-red-500 text-red-600" onClick={clearMonth}>
          Effacer le mois
        </button>
      </div>

      <footer className="mt-8 text-xs opacity-70 leading-relaxed">
        <p>
          Cette application web fonctionne hors-ligne (données stockées localement sur votre téléphone) et peut être « ajoutée à l'écran d'accueil » pour un usage comme une application mobile.
        </p>
        <p>
          Exportez en CSV pour partager ou archiver vos relevés d'heures. Le format CSV comprend les colonnes : Date, Début, Fin, Pause(min), Heures, Site/Chantier, Tâche, Nuit, Déplacement, Notes.
        </p>
      </footer>
    </div>
  );
}
