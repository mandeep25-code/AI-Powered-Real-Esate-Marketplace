import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { X, Send, Sparkles, MapPin, Phone, Briefcase, Award, MessageCircle, Building2, ArrowUpRight, Save } from "lucide-react";

const money = (n) => `$${(n / 1000000).toFixed(n >= 1000000 ? 2 : 1)}M`;
const timeAgo = (iso) => {
  if (!iso) return "";
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

export function AgentsSection({ agents, onOpenAgent }) {
  if (!agents?.length) return null;
  return (
    <section className="section agents-section" id="advisors" data-testid="agents-section">
      <div className="section-heading">
        <div><p className="kicker">THE ADVISORS</p><h2>People who <em>know the place.</em></h2></div>
        <p className="section-intro">Every home on Lumina is represented by a real advisor with specific taste, a small book, and time to answer your questions.</p>
      </div>
      <div className="agents-grid">
        {agents.slice(0, 6).map((agent) => (
          <article className="agent-card" key={agent.id} data-testid={`agent-card-${agent.id}`}>
            <div className="agent-portrait">
              {agent.profile?.portrait ? (
                <img src={agent.profile.portrait} alt={agent.name} />
              ) : (
                <span className="agent-initials">{agent.initials}</span>
              )}
            </div>
            <div className="agent-info">
              <p className="kicker">{agent.profile?.city || "Lumina advisor"}</p>
              <h3>{agent.name}</h3>
              <p className="agent-headline">{agent.profile?.headline || "Advisor"}</p>
              <div className="agent-meta">
                <span><Briefcase size={12} /> {agent.listingsCount} listing{agent.listingsCount === 1 ? "" : "s"}</span>
                {agent.profile?.yearsExperience ? <span><Award size={12} /> {agent.profile.yearsExperience} yrs</span> : null}
              </div>
              <button className="text-link agent-open" data-testid={`open-agent-${agent.id}`} onClick={() => onOpenAgent(agent.id)}>View advisor <ArrowUpRight size={13} /></button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function AgentProfileModal({ agentId, api, token, currentUserId, onClose, onMessage }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    axios.get(`${api}/agents/${agentId}`).then((r) => alive && setData(r.data)).catch((e) => alive && setError(e.response?.data?.message || "Unable to load advisor."));
    return () => { alive = false; };
  }, [agentId, api]);
  return (
    <div className="modal-backdrop" data-testid="agent-profile-modal">
      <div className="agent-modal">
        <button className="close-button" data-testid="close-agent-modal" onClick={onClose}><X /></button>
        {error && <p className="error">{error}</p>}
        {!data ? <div className="loading-state" data-testid="agent-loading">Opening the advisor’s book…</div> : (
          <>
            <div className="agent-hero">
              <div className="agent-portrait large">
                {data.agent.profile?.portrait ? <img src={data.agent.profile.portrait} alt={data.agent.name} /> : <span className="agent-initials">{data.agent.initials}</span>}
              </div>
              <div>
                <p className="kicker">LUMINA ADVISOR · {data.agent.profile?.city || "United States"}</p>
                <h2 data-testid="agent-name">{data.agent.name}</h2>
                <p className="agent-headline">{data.agent.profile?.headline}</p>
                <div className="agent-meta">
                  <span><Briefcase size={13} /> {data.listings.length} live listing{data.listings.length === 1 ? "" : "s"}</span>
                  {data.agent.profile?.yearsExperience ? <span><Award size={13} /> {data.agent.profile.yearsExperience} years</span> : null}
                  {data.agent.profile?.phone ? <span><Phone size={13} /> {data.agent.profile.phone}</span> : null}
                </div>
              </div>
            </div>
            <p className="agent-bio" data-testid="agent-bio">{data.agent.profile?.bio || "This advisor is preparing their story. Reach out — they respond personally."}</p>
            {data.agent.profile?.specialties?.length ? (
              <div className="agent-tags" data-testid="agent-specialties">{data.agent.profile.specialties.map((s) => <span key={s}>{s}</span>)}</div>
            ) : null}
            <div className="agent-listings-header"><span className="kicker">CURRENT REPRESENTATION</span></div>
            <div className="agent-listings">
              {data.listings.length ? data.listings.map((p) => (
                <div className="agent-listing" key={p.id} data-testid={`agent-listing-${p.id}`}>
                  <img src={p.image} alt={p.title} />
                  <div><strong>{p.title}</strong><span>{p.city} · {money(p.price)}</span></div>
                </div>
              )) : <p className="muted">No live listings right now — reach out for private inventory.</p>}
            </div>
            {token && currentUserId !== data.agent.id ? (
              <button className="gold-button full" data-testid="agent-message-button" onClick={() => onMessage(data.agent)}><MessageCircle size={15} /> Message {data.agent.name.split(" ")[0]}</button>
            ) : !token ? (
              <p className="demo-note">Sign in to message this advisor.</p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

export function AgentEditModal({ api, token, profile, onClose, onSaved }) {
  const initial = profile || { headline: "", bio: "", phone: "", specialties: [], yearsExperience: 0, city: "", portrait: "", licenseNumber: "" };
  const [form, setForm] = useState({ ...initial, specialties: (initial.specialties || []).join(", ") });
  const [status, setStatus] = useState("");
  const save = async (e) => {
    e.preventDefault();
    setStatus("Saving your profile…");
    try {
      const payload = { ...form, specialties: form.specialties.split(",").map((x) => x.trim()).filter(Boolean), yearsExperience: Number(form.yearsExperience) || 0 };
      const r = await axios.put(`${api}/me/profile`, payload, { headers: { Authorization: `Bearer ${token}` } });
      onSaved(r.data.profile);
      setStatus("Saved.");
      setTimeout(onClose, 500);
    } catch (err) {
      setStatus(err.response?.data?.message || "Could not save right now.");
    }
  };
  return (
    <div className="modal-backdrop" data-testid="agent-edit-modal">
      <div className="studio-modal">
        <div className="modal-head">
          <div><p className="kicker">ADVISOR PROFILE</p><h2>Introduce<br /><em>yourself.</em></h2></div>
          <button className="close-button" data-testid="close-agent-edit" onClick={onClose}><X /></button>
        </div>
        <p className="muted">A calm, specific profile earns the right conversations. Speak the way you would to a client.</p>
        <form className="listing-form" onSubmit={save}>
          <label>Headline<input data-testid="agent-headline-input" value={form.headline} onChange={(e) => setForm({ ...form, headline: e.target.value })} placeholder="Principal advisor · Coastal & lakefront homes" required /></label>
          <label>Short bio<textarea data-testid="agent-bio-input" value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} rows="3" placeholder="How you work, who you help, what you care about." required /></label>
          <div className="form-grid">
            <label>City<input data-testid="agent-city-input" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Austin, TX" /></label>
            <label>Years of experience<input data-testid="agent-years-input" type="number" min="0" value={form.yearsExperience} onChange={(e) => setForm({ ...form, yearsExperience: e.target.value })} placeholder="11" /></label>
            <label>Phone<input data-testid="agent-phone-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+1 (512) 555-0102" /></label>
            <label>License #<input data-testid="agent-license-input" value={form.licenseNumber} onChange={(e) => setForm({ ...form, licenseNumber: e.target.value })} placeholder="TX-882410" /></label>
          </div>
          <label>Portrait URL<input data-testid="agent-portrait-input" value={form.portrait} onChange={(e) => setForm({ ...form, portrait: e.target.value })} placeholder="https://…" /></label>
          <label>Specialties <span className="field-help">comma separated</span><input data-testid="agent-specialties-input" value={form.specialties} onChange={(e) => setForm({ ...form, specialties: e.target.value })} placeholder="Lakefront villas, Family homes" /></label>
          {status && <p className="studio-status" data-testid="agent-edit-status">{status}</p>}
          <button className="gold-button full" data-testid="agent-save-button"><Save size={15} /> Save profile</button>
        </form>
      </div>
    </div>
  );
}

export function InboxModal({ api, token, currentUser, initialThreadId, onClose, refreshInbox }) {
  const [threads, setThreads] = useState([]);
  const [active, setActive] = useState(null);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const auth = { headers: { Authorization: `Bearer ${token}` } };

  const loadThreads = async () => {
    try {
      const r = await axios.get(`${api}/messages`, auth);
      setThreads(r.data.threads || []);
      return r.data.threads || [];
    } catch { return []; }
  };

  const openThread = async (threadId) => {
    try {
      const r = await axios.get(`${api}/messages/threads/${threadId}`, auth);
      setActive(r.data);
      loadThreads();
      refreshInbox?.();
    } catch {
      setActive(null);
    }
  };

  useEffect(() => {
    (async () => {
      const list = await loadThreads();
      setLoading(false);
      const target = initialThreadId || list[0]?.threadId;
      if (target) openThread(target);
    })();
    // eslint-disable-next-line
  }, []);

  const send = async (e) => {
    e.preventDefault();
    if (!text.trim() || !active?.otherUser?.id) return;
    setSending(true);
    try {
      await axios.post(`${api}/messages`, { recipientId: active.otherUser.id, propertyId: active.property?.id || null, text }, auth);
      setText("");
      await openThread(active.threadId);
    } catch (err) {
      alert(err.response?.data?.message || "Could not send message.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="modal-backdrop" data-testid="inbox-modal">
      <div className="inbox-modal">
        <button className="close-button" data-testid="close-inbox-button" onClick={onClose}><X /></button>
        <div className="inbox-grid">
          <aside className="inbox-list">
            <div className="inbox-head"><p className="kicker">MESSAGES</p><h3>Your conversations</h3></div>
            {loading ? <div className="loading-state" data-testid="inbox-loading">Opening your inbox…</div> :
              threads.length === 0 ? <p className="muted" data-testid="inbox-empty">No conversations yet. Reach out to an advisor from any property.</p> :
              <ul className="thread-list">
                {threads.map((t) => (
                  <li key={t.threadId}>
                    <button className={`thread-row ${active?.threadId === t.threadId ? "active" : ""} ${t.unread ? "has-unread" : ""}`} data-testid={`thread-${t.threadId}`} onClick={() => openThread(t.threadId)}>
                      <div className="thread-avatar">{t.otherUser?.initials || "·"}</div>
                      <div className="thread-body">
                        <div className="thread-top"><strong>{t.otherUser?.name || "Advisor"}</strong><span>{timeAgo(t.lastAt)}</span></div>
                        {t.property && <p className="thread-property"><Building2 size={11} /> {t.property.title}</p>}
                        <p className="thread-preview">{t.lastText}</p>
                      </div>
                      {t.unread > 0 && <span className="thread-unread" data-testid={`unread-${t.threadId}`}>{t.unread}</span>}
                    </button>
                  </li>
                ))}
              </ul>}
          </aside>
          <section className="inbox-thread">
            {!active ? (
              <div className="thread-empty" data-testid="thread-empty"><Sparkles size={22} /><p>Choose a conversation to open it.</p></div>
            ) : (
              <>
                <header className="thread-header">
                  <div className="thread-avatar large">{active.otherUser?.initials || "·"}</div>
                  <div>
                    <strong data-testid="thread-other-name">{active.otherUser?.name || "Advisor"}</strong>
                    {active.property && <p className="muted"><MapPin size={12} /> {active.property.title} · {active.property.city}</p>}
                  </div>
                </header>
                <div className="thread-messages" data-testid="thread-messages">
                  {active.messages.map((m) => (
                    <div key={m.id} className={`thread-message ${m.senderId === currentUser.id ? "outgoing" : "incoming"}`}>
                      <p>{m.text}</p>
                      <small>{timeAgo(m.createdAt)}</small>
                    </div>
                  ))}
                </div>
                <form className="thread-composer" onSubmit={send}>
                  <textarea data-testid="thread-composer-input" value={text} onChange={(e) => setText(e.target.value)} placeholder={`Write to ${active.otherUser?.name?.split(" ")[0] || "them"}…`} rows="2" />
                  <button className="gold-button" data-testid="thread-send-button" disabled={sending || !text.trim()}><Send size={14} /> Send</button>
                </form>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

export function useUnreadCount(api, token) {
  const [unread, setUnread] = useState(0);
  const refresh = useMemo(() => async () => {
    if (!token) return setUnread(0);
    try {
      const r = await axios.get(`${api}/messages`, { headers: { Authorization: `Bearer ${token}` } });
      setUnread(r.data.unread || 0);
    } catch {}
  }, [api, token]);
  useEffect(() => { refresh(); }, [refresh]);
  return [unread, refresh];
}
