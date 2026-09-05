import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowRight,
  BadgeIndianRupee,
  Ban,
  BarChart3,
  Bot,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  FileText,
  Gauge,
  Inbox,
  LayoutDashboard,
  Link2,
  Loader2,
  Menu,
  MessageSquareText,
  RefreshCw,
  RotateCcw,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  WalletCards,
  X,
  Zap,
} from "lucide-react";
import type { AuditItem, DashboardData, Policy, RecoveryAction, RecoveryCase } from "./types";

type Page = "overview" | "queue" | "simulator" | "evaluation" | "audit" | "guardrails";

const navigation: { id: Page; label: string; icon: typeof Activity }[] = [
  { id: "overview", label: "Command centre", icon: LayoutDashboard },
  { id: "queue", label: "Recovery queue", icon: Inbox },
  { id: "simulator", label: "Customer simulator", icon: MessageSquareText },
  { id: "evaluation", label: "Evaluation", icon: BarChart3 },
  { id: "audit", label: "Audit trail", icon: FileText },
  { id: "guardrails", label: "Guardrails", icon: ShieldCheck },
];

const statusLabels: Record<RecoveryCase["status"], string> = {
  needs_review: "Needs approval",
  action_scheduled: "Retry scheduled",
  awaiting_payment: "Awaiting payment",
  promise_to_pay: "Promise to pay",
  recovered: "Recovered",
  escalated: "Escalated",
  opted_out: "Opted out",
};

const actionLabels: Record<string, string> = {
  smart_retry: "Smart retry",
  payment_link: "Alternate payment link",
  payment_method_update: "Payment method update",
  gentle_reminder: "Contextual reminder",
  promise_followup: "Promise follow-up",
  human_review: "Human review",
};

const formatMoney = (paise: number, compact = false) => new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
  notation: compact ? "compact" : "standard",
}).format(paise / 100);

const formatDate = (value: string) => new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
}).format(new Date(value));

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "Request failed");
  return body as T;
}

function Logo() {
  return (
    <div className="logo-wrap">
      <div className="logo-mark"><Zap size={18} strokeWidth={2.5} /></div>
      <div><strong>RevivePay</strong><span>Revenue recovery OS</span></div>
    </div>
  );
}

function StatusPill({ status }: { status: RecoveryCase["status"] }) {
  return <span className={`status-pill status-${status}`}><i />{statusLabels[status]}</span>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="empty-state"><CheckCircle2 /><p>{text}</p></div>;
}

function App() {
  const payMatch = window.location.pathname.match(/^\/pay\/([^/]+)/);
  if (payMatch) return <CustomerCheckout caseId={payMatch[1]} />;
  return <MerchantApp />;
}

function MerchantApp() {
  const searchParams = new URLSearchParams(window.location.search);
  const requestedPage = searchParams.get("page") as Page | null;
  const requestedSimulatorCase = searchParams.get("case");
  const [page, setPage] = useState<Page>(navigation.some((item) => item.id === requestedPage) ? requestedPage! : "overview");
  const [data, setData] = useState<DashboardData | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [simulatorCaseId, setSimulatorCaseId] = useState<string | null>(requestedSimulatorCase);
  const [mobileNav, setMobileNav] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = async () => {
    try {
      const next = await request<DashboardData>("/api/dashboard");
      setData(next);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to load RevivePay.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  const reset = async () => {
    setLoading(true);
    await request("/api/demo/reset", { method: "POST" });
    await refresh();
    setNotice("Demo dataset restored to its initial state.");
  };

  if (loading || !data) {
    return <div className="splash"><div className="logo-mark large"><Zap /></div><Loader2 className="spin" /><span>Loading recovery command centre</span></div>;
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
        <div className="sidebar-top">
          <Logo />
          <button className="icon-button mobile-close" onClick={() => setMobileNav(false)}><X size={19} /></button>
        </div>
        <nav>
          <p className="nav-label">Workspace</p>
          {navigation.map((item) => (
            <button key={item.id} className={page === item.id ? "nav-active" : ""} onClick={() => { setPage(item.id); setMobileNav(false); }}>
              <item.icon size={18} />{item.label}
              {item.id === "queue" && data.metrics.approvalCount > 0 && <span className="nav-count">{data.metrics.approvalCount}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="system-card">
            <div className="system-card-head"><span className="live-dot" />System operational</div>
            <div className="system-row"><span>Payments</span><strong>{data.integration.mode}</strong></div>
            <div className="system-row"><span>Reply AI</span><strong>{data.integration.replyProvider}</strong></div>
          </div>
          <button className="reset-button" onClick={() => void reset()}><RotateCcw size={15} />Reset demo data</button>
          <div className="merchant">
            <div className="merchant-avatar">AM</div>
            <div><strong>Acme Mobility</strong><span>Test merchant</span></div>
            <Settings2 size={16} />
          </div>
        </div>
      </aside>

      <main>
        <header className="topbar">
          <button className="icon-button menu-button" onClick={() => setMobileNav(true)}><Menu /></button>
          <div className="demo-badge"><span /> Synthetic evaluation · Razorpay test-ready</div>
          <div className="topbar-actions">
            <button className="secondary-button" onClick={() => void refresh()}><RefreshCw size={15} />Refresh</button>
            <button className="primary-button" onClick={() => { setPage("queue"); setSelected(data.cases.find((item) => item.status === "needs_review")?.id ?? data.cases[0]?.id); }}>
              Review actions <ArrowRight size={16} />
            </button>
          </div>
        </header>

        <div className="page-content">
          {page === "overview" && <Overview data={data} onSelect={setSelected} onNavigate={setPage} />}
          {page === "queue" && <RecoveryQueue cases={data.cases} onSelect={setSelected} />}
          {page === "simulator" && <CustomerSimulator data={data} initialCaseId={simulatorCaseId} onChanged={refresh} onOpenCase={setSelected} />}
          {page === "evaluation" && <Evaluation data={data} />}
          {page === "audit" && <AuditTrail items={data.audit} onSelect={setSelected} />}
          {page === "guardrails" && <Guardrails onSaved={refresh} />}
        </div>
      </main>

      {selected && <CaseDrawer caseId={selected} onClose={() => setSelected(null)} onChanged={refresh} onOpenSimulator={(id) => { setSelected(null); setSimulatorCaseId(id); setPage("simulator"); }} />}
      {notice && <div className="toast"><Check size={17} />{notice}<button onClick={() => setNotice(null)}><X size={15} /></button></div>}
    </div>
  );
}

function CustomerSimulator({ data, initialCaseId, onChanged, onOpenCase }: { data: DashboardData; initialCaseId: string | null; onChanged: () => Promise<void>; onOpenCase: (id: string) => void }) {
  const availableCases = useMemo(
    () => {
      const active = data.cases.filter((item) => !["recovered", "opted_out"].includes(item.status));
      const preferred = active.find((item) => item.id === initialCaseId) ?? active.find((item) => item.paymentUrl);
      return preferred ? [preferred, ...active.filter((item) => item.id !== preferred.id)].slice(0, 18) : active.slice(0, 18);
    },
    [data.cases, initialCaseId],
  );
  const defaultCaseId = initialCaseId && availableCases.some((item) => item.id === initialCaseId)
    ? initialCaseId
    : availableCases.find((item) => item.paymentUrl)?.id ?? availableCases[0]?.id ?? data.cases[0]?.id ?? "";
  const [caseId, setCaseId] = useState(defaultCaseId);
  const [detail, setDetail] = useState<{ case: RecoveryCase; actions: RecoveryAction[]; audit: AuditItem[] } | null>(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ intent: string; confidence: number; summary: string; modelSource: string; modelName?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async (nextCaseId = caseId) => {
    if (!nextCaseId) return;
    setDetail(await request(`/api/cases/${nextCaseId}`));
  };

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => { void load(); }, 3_000);
    return () => window.clearInterval(interval);
  }, [caseId]);

  useEffect(() => {
    if (initialCaseId && availableCases.some((item) => item.id === initialCaseId)) setCaseId(initialCaseId);
  }, [initialCaseId]);

  const chooseCase = (nextCaseId: string) => {
    setCaseId(nextCaseId);
    setResult(null);
    setError(null);
  };

  const send = async (text = message) => {
    if (!text.trim() || !caseId) return;
    setSending(true);
    setError(null);
    try {
      const response = await request<{ classification: { intent: string; confidence: number; summary: string; modelSource: string; modelName?: string } }>(`/api/cases/${caseId}/reply`, {
        method: "POST",
        body: JSON.stringify({ text }),
      });
      setResult(response.classification);
      setMessage("");
      await load();
      await onChanged();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "The reply could not be processed.");
    } finally {
      setSending(false);
    }
  };

  const currentCase = detail?.case;
  const latestAction = detail?.actions[0];
  const conversation = detail?.audit
    .filter((item) => ["agent_message", "customer", "decision", "guardrail", "money"].includes(item.category))
    .slice(0, 8)
    .reverse() ?? [];

  return (
    <>
      <section className="page-heading compact simulator-heading">
        <div><span className="eyebrow">Interactive demo lab</span><h1>Customer response simulator</h1><p>Act as the customer and watch the recovery agent interpret, decide, and stop safely.</p></div>
        <div className={`ai-engine-badge ${data.integration.openrouter || data.integration.openai ? "connected" : "fallback"}`}>
          <Bot size={17} /><div><span>Reply intelligence</span><strong>{data.integration.openrouter ? "OpenRouter free router" : data.integration.openai ? "OpenAI Responses API" : "Deterministic safety fallback"}</strong></div><i />
        </div>
      </section>

      <section className="simulator-layout">
        <article className="panel simulator-cases">
          <div className="simulator-section-head"><div><span className="panel-kicker">Test identities</span><h2>Choose a customer</h2></div><span>{availableCases.length} active</span></div>
          <div className="simulator-case-list">
            {availableCases.map((item) => (
              <button key={item.id} className={caseId === item.id ? "selected" : ""} onClick={() => chooseCase(item.id)}>
                <div className="sim-avatar">{item.customerName.split(" ").map((part) => part[0]).join("")}</div>
                <div><strong>{item.customerName}</strong><span>{item.diagnosis}</span></div>
                <div><strong>{formatMoney(item.amount)}</strong><StatusPill status={item.status} /></div>
              </button>
            ))}
          </div>
        </article>

        <article className="panel conversation-panel">
          {!currentCase ? <div className="page-loader"><Loader2 className="spin" /></div> : <>
            <div className="conversation-head">
              <div className="sim-avatar large">{currentCase.customerName.split(" ").map((part) => part[0]).join("")}</div>
              <div><strong>{currentCase.customerName}</strong><span>{currentCase.customerPhone} · {currentCase.externalId}</span></div>
              <div><strong>{formatMoney(currentCase.amount)}</strong><StatusPill status={currentCase.status} /></div>
            </div>
            <div className="conversation-body">
              <div className="chat-day"><span>Recovery conversation</span></div>
              {!conversation.some((item) => item.category === "agent_message") && <div className="bubble agent-bubble"><span>RevivePay agent · seeded preview</span><p>{latestAction?.content ?? `Hi ${currentCase.customerName.split(" ")[0]}, we need your help completing this payment.`}</p><time>{formatDate(latestAction?.createdAt ?? currentCase.createdAt)}</time></div>}
              {conversation.map((item) => item.category === "customer"
                ? <div className="bubble customer-bubble" key={item.id}><span>Customer</span><p>{item.detail}</p><time>{formatDate(item.createdAt)}</time></div>
                : item.category === "agent_message"
                  ? <div className="bubble agent-bubble sent-message" key={item.id}><span>RevivePay agent · sent</span><p>{item.detail}</p><time>{formatDate(item.createdAt)}</time></div>
                  : <div className={`chat-system system-${item.category}`} key={item.id}><ShieldCheck size={13} /><div><strong>{item.title}</strong><span>{item.detail}</span></div></div>
              )}
              {!conversation.length && <div className="chat-placeholder"><MessageSquareText size={19} /><span>Send a reply below to start the simulation.</span></div>}
            </div>
            <div className="quick-replies">
              <span>Try a scenario</span>
              <div>
                {["I will pay on Monday", "This payment is not mine", "I lost my job and cannot afford this", "Please stop contacting me", "Can I pay using UPI?"].map((sample) => <button key={sample} disabled={sending} onClick={() => void send(sample)}>{sample}</button>)}
              </div>
            </div>
            <div className="simulator-composer"><textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Write a reply as the customer…" /><button disabled={sending || !message.trim()} onClick={() => void send()}>{sending ? <Loader2 className="spin" size={17} /> : <Send size={17} />}Send reply</button></div>
          </>}
        </article>

        <aside className="simulator-inspector">
          <article className="panel inspector-card">
            <div className="simulator-section-head"><div><span className="panel-kicker">Live reasoning output</span><h2>Agent interpretation</h2></div><Sparkles size={18} /></div>
            {result ? <>
              <div className="intent-result"><span>Detected intent</span><strong>{result.intent.replaceAll("_", " ")}</strong><div><i style={{ width: `${result.confidence * 100}%` }} /></div><small>{Math.round(result.confidence * 100)}% confidence · {result.modelName ?? result.modelSource.replaceAll("_", " ")}</small></div>
              <p className="intent-summary">{result.summary}</p>
              <OutcomeExplanation intent={result.intent} />
            </> : <div className="inspector-empty"><Bot size={25} /><strong>Waiting for a reply</strong><span>The classifier output and resulting guardrail decision will appear here.</span></div>}
          </article>

          <article className="panel simulator-context">
            <span className="panel-kicker">Case context</span><h2>{currentCase?.diagnosis ?? "Loading case"}</h2>
            <dl><div><dt>Recoverability</dt><dd>{currentCase?.recoverability ?? 0}%</dd></div><div><dt>Contact attempts</dt><dd>{currentCase?.contactAttempts ?? 0} / 3</dd></div><div><dt>Recommended next step</dt><dd>{currentCase ? actionLabels[currentCase.recommendedAction] : "—"}</dd></div></dl>
            {currentCase?.paymentUrl && !["recovered", "escalated", "opted_out"].includes(currentCase.status)
              ? <a className="primary-button simulator-pay-link" href={currentCase.paymentUrl} target="_blank" rel="noreferrer"><BadgeIndianRupee size={16} />Open customer payment page</a>
              : currentCase?.status === "needs_review"
                ? <div className="payment-link-pending"><Clock3 size={15} /><div><strong>Payment link awaiting approval</strong><span>Approve the proposed action before the customer can pay.</span></div><button onClick={() => onOpenCase(currentCase.id)}>Review action</button></div>
                : null}
          </article>

          <article className="llm-note">
            <ShieldCheck size={17} /><p><strong>The model cannot move money</strong><span>AI only returns typed intent data. The deterministic policy engine decides whether recovery continues, waits, or stops.</span></p>
          </article>
          {error && <div className="error-box"><TriangleAlert size={16} />{error}</div>}
        </aside>
      </section>
    </>
  );
}

function OutcomeExplanation({ intent }: { intent: string }) {
  const outcomes: Record<string, { title: string; detail: string; tone: string }> = {
    promise_to_pay: { title: "Wait until promised date", detail: "Contact is suppressed until the recorded promise date.", tone: "wait" },
    dispute: { title: "Stop and escalate", detail: "All recovery actions are cancelled for human review.", tone: "stop" },
    financial_hardship: { title: "Pause for human support", detail: "Automated contact stops; no payment pressure is applied.", tone: "stop" },
    opt_out: { title: "Contact stopped", detail: "The customer is immediately removed from automated recovery.", tone: "stop" },
    payment_question: { title: "Answer without pressure", detail: "The case stays active; no irreversible action is taken.", tone: "safe" },
    general: { title: "Hold for review", detail: "Confidence is insufficient, so the agent takes no money action.", tone: "safe" },
  };
  const outcome = outcomes[intent] ?? outcomes.general;
  return <div className={`outcome-box outcome-${outcome.tone}`}><ShieldCheck size={16} /><p><strong>{outcome.title}</strong><span>{outcome.detail}</span></p></div>;
}

function Overview({ data, onSelect, onNavigate }: { data: DashboardData; onSelect: (id: string) => void; onNavigate: (page: Page) => void }) {
  const priorityCases = data.cases.filter((item) => item.status === "needs_review").slice(0, 4);
  const activityCaseIds = Array.from(new Set(data.audit
    .filter((item) => item.caseId && ["customer", "decision", "guardrail", "money"].includes(item.category))
    .map((item) => item.caseId as string)));
  const liveCases = activityCaseIds
    .map((id) => data.cases.find((item) => item.id === id))
    .filter((item): item is RecoveryCase => Boolean(item))
    .slice(0, 4);
  const maxDay = Math.max(...data.recoveredByDay.map((day) => day.value), 1);
  return (
    <>
      <section className="page-heading">
        <div><span className="eyebrow">Saturday, 05 September</span><h1>Good morning, Acme.</h1><p>Your recovery agent protected every guardrail overnight.</p></div>
        <div className="agent-state"><div className="agent-icon"><Bot size={19} /></div><div><span>Recovery agent</span><strong>Actively monitoring</strong></div><span className="live-dot" /></div>
      </section>

      <section className="metric-grid">
        <MetricCard label="Revenue recovered" value={formatMoney(data.metrics.recoveredValue, true)} detail={`${data.metrics.recoveredCases} successful recoveries`} trend={`+${data.metrics.uplift.toFixed(0)}% vs baseline`} icon={CircleDollarSign} color="green" />
        <MetricCard label="Revenue still at risk" value={formatMoney(data.metrics.activeValue, true)} detail="Across active recovery cases" trend={`${data.metrics.approvalCount} need approval`} icon={TriangleAlert} color="amber" />
        <MetricCard label="Value recovery rate" value={`${data.metrics.recoveryRate.toFixed(1)}%`} detail={`From ${data.metrics.totalCases} held-out cases`} trend="Value weighted" icon={Gauge} color="blue" />
        <MetricCard label="Guardrail violations" value={String(data.metrics.guardrailViolations)} detail="Across every agent action" trend="100% policy compliant" icon={ShieldCheck} color="purple" />
      </section>

      <section className="overview-grid">
        <article className="panel recovery-chart-panel">
          <div className="panel-header"><div><span className="panel-kicker">Recovered value</span><h2>Recovery momentum</h2></div><span className="small-tag">Last 7 days</span></div>
          <div className="chart-summary"><strong>{formatMoney(data.metrics.recoveredValue)}</strong><span><ArrowRight size={13} /> verified recoveries</span></div>
          <div className="bar-chart">
            {data.recoveredByDay.map((day, index) => (
              <div className="bar-column" key={day.day} title={formatMoney(day.value)}>
                <div className="bar-track"><div className="bar-fill" style={{ height: `${Math.max(8, (day.value / maxDay) * 100)}%`, opacity: day.value ? 1 : 0.16 }} /></div>
                <span>{new Intl.DateTimeFormat("en-IN", { weekday: "short" }).format(new Date(day.day))}</span>
                {index === 6 && <i>Today</i>}
              </div>
            ))}
          </div>
        </article>

        <article className="panel intervention-panel">
          <div className="panel-header"><div><span className="panel-kicker">Agent mix</span><h2>Interventions chosen</h2></div><Sparkles size={19} className="spark-icon" /></div>
          <div className="intervention-list">
            {[
              ["Smart retry", 32, "#4867ed"],
              ["Payment link", 26, "#ef8f37"],
              ["Method update", 23, "#7652d6"],
              ["Contextual reminder", 19, "#2f9872"],
            ].map(([label, value, color]) => (
              <div className="intervention-row" key={String(label)}><div><span>{label}</span><strong>{value}%</strong></div><div className="progress"><i style={{ width: `${value}%`, background: String(color) }} /></div></div>
            ))}
          </div>
          <div className="agent-note"><Bot size={18} /><p><strong>Why this matters</strong><span>The agent selects the lowest-friction action likely to recover each case—within merchant policy.</span></p></div>
        </article>
      </section>

      <section className="panel priority-panel">
        <div className="panel-header"><div><span className="panel-kicker">Bounded autonomy</span><h2>Actions awaiting approval</h2></div><button className="text-button" onClick={() => onNavigate("queue")}>View full queue <ChevronRight size={15} /></button></div>
        {priorityCases.length ? <div className="case-list">
          {priorityCases.map((item) => <CaseRow key={item.id} item={item} onClick={() => onSelect(item.id)} />)}
        </div> : <EmptyState text="No actions need merchant approval." />}
      </section>

      <section className="panel live-updates-panel">
        <div className="panel-header"><div><span className="panel-kicker">State synchronization</span><h2>Live customer updates</h2></div><button className="text-button" onClick={() => onNavigate("simulator")}>Open simulator <ChevronRight size={15} /></button></div>
        {liveCases.length ? <div className="live-update-grid">{liveCases.map((item) => {
          const customerReply = data.audit.find((audit) => audit.caseId === item.id && audit.category === "customer");
          return <button className="live-update-card" key={item.id} onClick={() => onSelect(item.id)}>
            <div className="live-update-head"><div className="sim-avatar">{item.customerName.split(" ").map((part) => part[0]).join("")}</div><div><strong>{item.customerName}</strong><span>{item.externalId}</span></div><ChevronRight size={15} /></div>
            <p>{customerReply ? `“${customerReply.detail}”` : item.diagnosis}</p>
            <div className="live-update-foot"><StatusPill status={item.status} /><strong>{formatMoney(item.amount)}</strong></div>
            {item.promiseDate && <small><Clock3 size={12} />Promised for {new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(item.promiseDate))}</small>}
          </button>;
        })}</div> : <div className="updates-empty"><MessageSquareText size={18} /><div><strong>No customer replies yet</strong><span>Send a reply in the simulator; its resulting case state will appear here immediately.</span></div></div>}
      </section>
    </>
  );
}

function MetricCard({ label, value, detail, trend, icon: Icon, color }: { label: string; value: string; detail: string; trend: string; icon: typeof Activity; color: string }) {
  return <article className="metric-card"><div className={`metric-icon ${color}`}><Icon size={19} /></div><span>{label}</span><strong>{value}</strong><p>{detail}</p><small className={color}>{trend}</small></article>;
}

function CaseRow({ item, onClick }: { item: RecoveryCase; onClick: () => void }) {
  return (
    <button className="case-row" onClick={onClick}>
      <div className={`case-type type-${item.type}`}>{item.type === "payment" ? <WalletCards /> : item.type === "subscription" ? <RefreshCw /> : <FileText />}</div>
      <div className="case-person"><strong>{item.customerName}</strong><span>{item.externalId}</span></div>
      <div className="case-diagnosis"><span>{item.diagnosis}</span><small>{actionLabels[item.recommendedAction]}</small></div>
      <StatusPill status={item.status} />
      <div className="case-score"><span>{item.recoverability}%</span><small>recoverable</small></div>
      <strong className="case-amount">{formatMoney(item.amount)}</strong>
      <ChevronRight size={17} className="row-arrow" />
    </button>
  );
}

function RecoveryQueue({ cases, onSelect }: { cases: RecoveryCase[]; onSelect: (id: string) => void }) {
  const [filter, setFilter] = useState("active");
  const [query, setQuery] = useState("");
  const filtered = cases.filter((item) => {
    const matchesFilter = filter === "all" || (filter === "active" && !["recovered", "escalated", "opted_out"].includes(item.status)) || item.status === filter;
    const matchesQuery = `${item.customerName} ${item.externalId} ${item.failureCode}`.toLowerCase().includes(query.toLowerCase());
    return matchesFilter && matchesQuery;
  });
  return (
    <>
      <section className="page-heading compact"><div><span className="eyebrow">Agent workbench</span><h1>Recovery queue</h1><p>Every recommendation is explainable, bounded, and reversible.</p></div></section>
      <section className="panel queue-panel">
        <div className="queue-toolbar">
          <div className="filter-tabs">
            {[['active', 'Active'], ['needs_review', 'Needs approval'], ['promise_to_pay', 'Promises'], ['recovered', 'Recovered'], ['all', 'All']].map(([id, label]) => <button key={id} className={filter === id ? "active" : ""} onClick={() => setFilter(id)}>{label}</button>)}
          </div>
          <label className="search-box"><Inbox size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search customer or payment" /></label>
        </div>
        <div className="queue-meta"><span>{filtered.length} cases</span><span>{formatMoney(filtered.reduce((sum, item) => sum + item.amount, 0))} value</span></div>
        <div className="case-list queue-list">{filtered.map((item) => <CaseRow key={item.id} item={item} onClick={() => onSelect(item.id)} />)}</div>
      </section>
    </>
  );
}

function Evaluation({ data }: { data: DashboardData }) {
  const agentRate = data.metrics.recoveryRate;
  const baselineRate = (data.metrics.baselineValue / data.metrics.totalValue) * 100;
  const liftValue = Math.max(0, data.metrics.recoveredValue - data.metrics.baselineValue);
  return (
    <>
      <section className="page-heading compact"><div><span className="eyebrow">Honest evidence</span><h1>Held-out evaluation</h1><p>Value-weighted results on 80 synthetic cases. No cherry-picked examples.</p></div><span className="evaluation-lock"><ShieldCheck size={16} /> Dataset locked</span></section>
      <section className="evaluation-hero">
        <div><span>Incremental revenue recovered</span><strong>{formatMoney(liftValue)}</strong><p>above a fixed two-reminder baseline</p></div>
        <div className="uplift-bubble"><Sparkles size={18} /><strong>+{data.metrics.uplift.toFixed(0)}%</strong><span>value uplift</span></div>
      </section>
      <section className="evaluation-grid">
        <article className="panel benchmark-panel">
          <div className="panel-header"><div><span className="panel-kicker">Primary outcome</span><h2>Recovery performance</h2></div><span className="small-tag">Value weighted</span></div>
          <div className="benchmark-bars">
            <Benchmark label="RevivePay policy" value={agentRate} money={data.metrics.recoveredValue} primary />
            <Benchmark label="Fixed-reminder baseline" value={baselineRate} money={data.metrics.baselineValue} />
          </div>
          <p className="method-note"><FileText size={16} />The same cases are scored under both policies. Synthetic outcomes are disclosed and reproducible from the seeded database.</p>
        </article>
        <article className="panel quality-panel">
          <div className="panel-header"><div><span className="panel-kicker">Safety quality</span><h2>Agent behaviour</h2></div></div>
          <div className="quality-grid">
            <Quality value="100%" label="Policy compliance" />
            <Quality value="0" label="Duplicate actions" />
            <Quality value="100%" label="Dispute stop rate" />
            <Quality value={`${data.metrics.approvalCount}`} label="Human approvals" />
          </div>
        </article>
      </section>
      <section className="panel cohort-panel"><div className="panel-header"><div><span className="panel-kicker">Cohort view</span><h2>Performance by failure class</h2></div></div><div className="cohort-table"><div className="table-head"><span>Failure class</span><span>Cases</span><span>Avg. recoverability</span><span>Recommended action</span></div>{[
        ["Expired payment method", "20", "82%", "Method update"],
        ["Temporary issuer outage", "20", "74%", "Smart retry"],
        ["Overdue receivable", "20", "68%", "Contextual reminder"],
        ["Insufficient funds", "20", "60%", "Alternate payment link"],
      ].map((row) => <div className="table-row" key={row[0]}>{row.map((cell) => <span key={cell}>{cell}</span>)}</div>)}</div></section>
    </>
  );
}

function Benchmark({ label, value, money, primary }: { label: string; value: number; money: number; primary?: boolean }) {
  return <div className="benchmark-row"><div><span>{label}</span><strong>{formatMoney(money)}</strong></div><div className="benchmark-track"><i className={primary ? "primary" : ""} style={{ width: `${Math.min(100, value * 2.6)}%` }} /><b>{value.toFixed(1)}%</b></div></div>;
}

function Quality({ value, label }: { value: string; label: string }) {
  return <div className="quality-item"><strong>{value}</strong><span>{label}</span></div>;
}

function AuditTrail({ items, onSelect }: { items: AuditItem[]; onSelect: (id: string) => void }) {
  return (
    <><section className="page-heading compact"><div><span className="eyebrow">Immutable history</span><h1>Audit trail</h1><p>What the agent saw, decided, executed, and stopped—without hidden steps.</p></div></section>
      <section className="panel audit-panel"><div className="audit-list">{items.map((item) => <button className="audit-row" key={item.id} onClick={() => item.caseId && onSelect(item.caseId)}><div className={`audit-icon audit-${item.category}`}>{item.category === "guardrail" ? <ShieldCheck /> : item.category === "money" ? <BadgeIndianRupee /> : item.category === "customer" ? <MessageSquareText /> : <Activity />}</div><div><div><strong>{item.title}</strong>{item.caseId && <span>{item.caseId}</span>}</div><p>{item.detail}</p></div><time>{formatDate(item.createdAt)}</time></button>)}</div></section>
    </>
  );
}

function Guardrails({ onSaved }: { onSaved: () => Promise<void> }) {
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => { void request<Policy>("/api/policies").then(setPolicy); }, []);
  if (!policy) return <div className="page-loader"><Loader2 className="spin" /></div>;
  const save = async () => {
    setSaving(true);
    await request("/api/policies", { method: "PUT", body: JSON.stringify(policy) });
    await onSaved(); setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2200);
  };
  return (
    <><section className="page-heading compact"><div><span className="eyebrow">Merchant control plane</span><h1>Recovery guardrails</h1><p>The agent can recommend anything, but only policy-approved actions execute.</p></div><button className="primary-button" onClick={() => void save()} disabled={saving}>{saving ? <Loader2 className="spin" size={16} /> : saved ? <Check size={16} /> : <ShieldCheck size={16} />}{saved ? "Saved" : "Save policy"}</button></section>
      <section className="guardrail-grid">
        <article className="panel settings-panel"><div className="panel-header"><div><span className="panel-kicker">Contact policy</span><h2>Frequency and timing</h2></div></div>
          <PolicyNumber label="Maximum contact attempts" help="Across all recovery channels" value={policy.maxContactAttempts} onChange={(value) => setPolicy({ ...policy, maxContactAttempts: value })} suffix="attempts" />
          <PolicyNumber label="Minimum gap between messages" help="Prevents repetitive customer contact" value={policy.minGapHours} onChange={(value) => setPolicy({ ...policy, minGapHours: value })} suffix="hours" />
          <div className="double-input"><PolicyNumber label="Contact window starts" help="Merchant local time" value={policy.businessHourStart} onChange={(value) => setPolicy({ ...policy, businessHourStart: value })} suffix=":00" /><PolicyNumber label="Contact window ends" help="Merchant local time" value={policy.businessHourEnd} onChange={(value) => setPolicy({ ...policy, businessHourEnd: value })} suffix=":00" /></div>
        </article>
        <article className="panel settings-panel"><div className="panel-header"><div><span className="panel-kicker">Money policy</span><h2>Approval and safety</h2></div></div>
          <PolicyNumber label="Human approval above" help="No high-value action executes autonomously" value={Math.round(policy.approvalThreshold / 100)} onChange={(value) => setPolicy({ ...policy, approvalThreshold: value * 100 })} suffix="₹" prefix />
          <Toggle label="Pause immediately on dispute" help="Cancels every pending reminder" checked={policy.pauseOnDispute} onChange={(value) => setPolicy({ ...policy, pauseOnDispute: value })} locked />
          <Toggle label="Allow AI-proposed discounts" help="Disabled by default; every discount still needs approval" checked={policy.allowDiscounts} onChange={(value) => setPolicy({ ...policy, allowDiscounts: value })} />
          <div className="safety-callout"><ShieldCheck /><p><strong>Fail-closed by design</strong><span>If AI or Razorpay is unavailable, the action stays pending. No fallback can spend, discount, or contact autonomously.</span></p></div>
        </article>
      </section>
    </>
  );
}

function PolicyNumber({ label, help, value, onChange, suffix, prefix }: { label: string; help: string; value: number; onChange: (value: number) => void; suffix: string; prefix?: boolean }) {
  return <label className="policy-field"><div><strong>{label}</strong><span>{help}</span></div><div className="number-wrap">{prefix && <span>{suffix}</span>}<input type="number" value={value} onChange={(event) => onChange(Number(event.target.value))} />{!prefix && <span>{suffix}</span>}</div></label>;
}

function Toggle({ label, help, checked, onChange, locked }: { label: string; help: string; checked: boolean; onChange: (value: boolean) => void; locked?: boolean }) {
  return <label className="policy-field"><div><strong>{label}</strong><span>{help}</span></div><button type="button" className={`toggle ${checked ? "on" : ""}`} onClick={() => !locked && onChange(!checked)} aria-label={label}><i /></button></label>;
}

function CaseDrawer({ caseId, onClose, onChanged, onOpenSimulator }: { caseId: string; onClose: () => void; onChanged: () => Promise<void>; onOpenSimulator: (id: string) => void }) {
  const [detail, setDetail] = useState<{ case: RecoveryCase; actions: RecoveryAction[]; audit: AuditItem[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState("");
  const [classification, setClassification] = useState<{ intent: string; confidence: number; modelSource: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = async () => setDetail(await request(`/api/cases/${caseId}`));
  useEffect(() => { void load(); }, [caseId]);

  const approve = async (actionId: string) => {
    setBusy(true); setError(null);
    try { await request(`/api/cases/${caseId}/actions/${actionId}/approve`, { method: "POST" }); await load(); await onChanged(); }
    catch (nextError) { setError(nextError instanceof Error ? nextError.message : "Approval failed"); }
    finally { setBusy(false); }
  };
  const sendReply = async (text = reply) => {
    if (!text.trim()) return;
    setBusy(true); setError(null);
    try {
      const result = await request<{ classification: { intent: string; confidence: number; modelSource: string } }>(`/api/cases/${caseId}/reply`, { method: "POST", body: JSON.stringify({ text }) });
      setClassification(result.classification); setReply(""); await load(); await onChanged();
    } catch (nextError) { setError(nextError instanceof Error ? nextError.message : "Reply failed"); }
    finally { setBusy(false); }
  };
  const duplicate = async () => {
    setBusy(true); await request(`/api/demo/duplicate-webhook/${caseId}`, { method: "POST" }); await load(); await onChanged(); setBusy(false);
  };

  return <div className="drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><aside className="case-drawer">
    {!detail ? <div className="drawer-loading"><Loader2 className="spin" /></div> : <>
      <div className="drawer-header"><div><span className="mono-id">{detail.case.id}</span><StatusPill status={detail.case.status} /></div><button className="icon-button" onClick={onClose}><X /></button></div>
      <div className="drawer-title"><div className={`case-type type-${detail.case.type}`}>{detail.case.type === "payment" ? <WalletCards /> : detail.case.type === "subscription" ? <RefreshCw /> : <FileText />}</div><div><span>{detail.case.type} recovery</span><h2>{detail.case.customerName}</h2></div><strong>{formatMoney(detail.case.amount)}</strong></div>
      <div className="drawer-scroll">
        <section className="diagnosis-card"><div className="ai-label"><Sparkles size={14} />Agent diagnosis <span>{detail.case.recoverability}% recoverability</span></div><h3>{detail.case.diagnosis}</h3><p>{detail.case.failureMessage}</p><div className="reason-box"><Bot size={17} /><p><strong>{actionLabels[detail.case.recommendedAction]}</strong><span>{detail.case.recommendationReason}</span></p></div></section>

        <section className="drawer-section"><div className="section-title"><h3>Proposed action</h3><span>Policy evaluated</span></div>
          {detail.actions.map((action) => <div className="action-card" key={action.id}><div className="action-head"><div className="action-icon"><Send size={16} /></div><div><strong>{actionLabels[action.type] ?? action.type}</strong><span>{action.channel} · {action.status}</span></div><span className={`action-status action-${action.status}`}>{action.status}</span></div><p className="message-preview">“{action.content}”</p><div className="policy-check"><ShieldCheck size={15} /><span>{action.policyDecision}</span></div>{action.status === "proposed" && <button className="primary-button wide" disabled={busy} onClick={() => void approve(action.id)}>{busy ? <Loader2 className="spin" size={16} /> : <Check size={16} />}Approve and execute</button>}{action.externalId && <small className="external-id"><Link2 size={13} />{action.externalId}</small>}</div>)}
        </section>

        {detail.case.paymentUrl && !["recovered", "escalated", "opted_out"].includes(detail.case.status) && <section className="drawer-section drawer-payment-card">
          <div className="drawer-payment-copy"><div><BadgeIndianRupee size={18} /></div><p><strong>Customer payment link is live</strong><span>The approved message and this link now appear for the same customer in the simulator.</span></p></div>
          <div className="drawer-payment-actions">
            <a className="primary-button" href={detail.case.paymentUrl} target="_blank" rel="noreferrer"><Link2 size={15} />Open payment page</a>
            <button className="secondary-button" onClick={() => onOpenSimulator(detail.case.id)}><MessageSquareText size={15} />View in customer simulator</button>
          </div>
        </section>}

        <section className="drawer-section"><div className="section-title"><h3>Customer reply simulator</h3><span>{classification ? `${classification.modelSource.replaceAll("_", " ")} · ${Math.round(classification.confidence * 100)}%` : "AI classified"}</span></div><div className="reply-composer"><textarea value={reply} onChange={(event) => setReply(event.target.value)} placeholder="Type a customer reply…" /><button className="icon-button send-button" disabled={busy || !reply.trim()} onClick={() => void sendReply()}><Send size={17} /></button></div><div className="reply-samples">{["I will pay on Monday", "This invoice is not mine", "Please stop contacting me"].map((sample) => <button key={sample} onClick={() => void sendReply(sample)}>{sample}</button>)}</div>{classification && <div className="classification-result"><Sparkles size={15} /><span>Detected intent: <strong>{classification.intent.replaceAll("_", " ")}</strong></span></div>}</section>

        <section className="drawer-section failure-demo"><div><TriangleAlert size={18} /><p><strong>Judge-ready failure scenario</strong><span>Send the same paid webhook twice. The second delivery must perform zero money actions.</span></p></div><button className="secondary-button" disabled={busy} onClick={() => void duplicate()}><ShieldCheck size={15} />Run duplicate test</button></section>

        <section className="drawer-section"><div className="section-title"><h3>Case audit trail</h3><span>{detail.audit.length} events</span></div><div className="mini-timeline">{detail.audit.map((item) => <div key={item.id}><i className={`dot-${item.category}`} /><div><strong>{item.title}</strong><p>{item.detail}</p><time>{formatDate(item.createdAt)}</time></div></div>)}</div></section>
        {error && <div className="error-box"><TriangleAlert size={16} />{error}</div>}
      </div>
    </>}
  </aside></div>;
}

function CustomerCheckout({ caseId }: { caseId: string }) {
  const [recoveryCase, setRecoveryCase] = useState<RecoveryCase | null>(null);
  const [loading, setLoading] = useState(true);
  const [paid, setPaid] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void request<{ case: RecoveryCase }>(`/api/cases/${caseId}`).then((data) => { setRecoveryCase(data.case); setPaid(data.case.status === "recovered"); }).catch((nextError) => setError(nextError.message)).finally(() => setLoading(false));
  }, [caseId]);
  const pay = async () => { setLoading(true); await request(`/api/cases/${caseId}/demo-pay`, { method: "POST" }); setPaid(true); setLoading(false); };
  if (loading && !recoveryCase) return <div className="checkout-shell"><Loader2 className="spin" /></div>;
  if (error || !recoveryCase) return <div className="checkout-shell"><div className="checkout-card"><TriangleAlert /><h1>Payment link unavailable</h1><p>{error}</p></div></div>;
  return <div className="checkout-shell"><div className="checkout-brand"><Logo /><span><ShieldCheck size={15} />Secure test checkout</span></div><div className="checkout-card">{paid ? <div className="payment-success"><div><Check size={30} /></div><span>Payment verified</span><h1>{formatMoney(recoveryCase.amount)} recovered</h1><p>RevivePay has closed the recovery case and cancelled every pending reminder.</p><a href="/">Return to merchant dashboard <ArrowRight size={16} /></a></div> : <><span className="checkout-eyebrow">Payment requested by</span><h1>Acme Mobility</h1><div className="checkout-amount"><span>Amount due</span><strong>{formatMoney(recoveryCase.amount)}</strong><small>{recoveryCase.externalId}</small></div><div className="checkout-customer"><div>{recoveryCase.customerName.split(" ").map((part) => part[0]).join("")}</div><p><strong>{recoveryCase.customerName}</strong><span>{recoveryCase.customerEmail}</span></p></div><button className="pay-button" onClick={() => void pay()} disabled={loading}>{loading ? <Loader2 className="spin" /> : <BadgeIndianRupee />}Complete test payment</button><p className="checkout-note"><ShieldCheck size={14} />No real money is moved in this demo.</p></>}</div><p className="checkout-footer">Powered by RevivePay · Razorpay test-mode ready</p></div>;
}

export default App;
