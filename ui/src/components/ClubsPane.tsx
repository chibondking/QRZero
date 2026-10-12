import { useEffect, useRef, useState } from "react";
import { defaultClubs, newClubId, setClubs, useClubs, type Club } from "../clubsPref";
import "../clubs.css";

/** The operator's own club memberships: name and number, ready to read off or copy on the air. */
export default function ClubsPane() {
  const clubs = useClubs();
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = (c: Club) => {
    if (!c.number.trim()) return;
    navigator.clipboard.writeText(c.number.trim()).then(
      () => {
        setCopied(c.id);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setCopied(null), 1500);
      },
      () => {},
    );
  };

  const update = (id: string, patch: Partial<Club>) => setClubs(clubs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= clubs.length) return;
    const next = [...clubs];
    [next[i], next[j]] = [next[j], next[i]];
    setClubs(next);
  };

  return (
    <section className="panel clubs-pane">
      <div className="panel-title">
        {/* A div, not a span: the workspace hides a title bar's leading span. */}
        <div>MyClubs</div>
        <span className="spacer" />
        <button className="tiny" onClick={() => setEditing(!editing)} aria-pressed={editing}>
          {editing ? "Done" : "Edit"}
        </button>
      </div>
      <div className="cl-body">
        {!editing && clubs.length === 0 && <div className="cl-empty muted">No clubs yet. Press Edit to add the ones you belong to.</div>}
        {!editing && clubs.length > 0 && (
          <table className="cl-table">
            <tbody>
              {clubs.map((c) => (
                <tr key={c.id}>
                  <td className="cl-name">{c.name || "(unnamed)"}</td>
                  <td className="cl-num">
                    {c.number.trim() ? (
                      <button className="cl-copy" onClick={() => copy(c)} title="Click to copy the number">
                        {c.number}
                      </button>
                    ) : (
                      <span className="muted">not set</span>
                    )}
                  </td>
                  <td className="cl-note muted">{copied === c.id ? "Copied" : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {editing && (
          <>
            <table className="cl-table cl-edit">
              <tbody>
                {clubs.map((c, i) => (
                  <tr key={c.id}>
                    <td>
                      <input value={c.name} aria-label="Club name" placeholder="Club" onChange={(e) => update(c.id, { name: e.target.value })} />
                    </td>
                    <td>
                      <input value={c.number} aria-label={`${c.name || "Club"} number`} placeholder="Number" onChange={(e) => update(c.id, { number: e.target.value })} />
                    </td>
                    <td className="cl-btns">
                      <button className="tiny" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${c.name} up`} title="Move up">
                        Up
                      </button>
                      <button className="tiny" disabled={i === clubs.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${c.name} down`} title="Move down">
                        Down
                      </button>
                      <button className="tiny danger" onClick={() => setClubs(clubs.filter((x) => x.id !== c.id))} aria-label={`Remove ${c.name}`}>
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="cl-actions">
              <button className="tiny" onClick={() => setClubs([...clubs, { id: newClubId(), name: "", number: "" }])}>
                Add club
              </button>
              <button
                className="tiny"
                onClick={() => {
                  const have = new Set(clubs.map((c) => c.name.toLowerCase()));
                  const missing = defaultClubs().filter((d) => !have.has(d.name.toLowerCase()));
                  if (missing.length) setClubs([...clubs, ...missing]);
                }}
                title="Add back CWops, SKCC, NAQCC, FISTS and 10-10 if you removed them"
              >
                Add common clubs
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
