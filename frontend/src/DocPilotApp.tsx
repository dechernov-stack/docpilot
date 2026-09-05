import {
  AlertTriangle,
  ArrowDownToLine,
  Box,
  Braces,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Clock3,
  Code2,
  Database,
  FileCheck2,
  FileCode2,
  FileText,
  GitCommitHorizontal,
  GitCompareArrows,
  Hash,
  Image,
  Info,
  Link2,
  ListFilter,
  LoaderCircle,
  LockKeyhole,
  PencilLine,
  Plus,
  Printer,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
  Table2,
  UserRound,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError } from './api';
import { fallbackDemo } from './fallback';
import type {
  Baseline,
  Demo,
  DiffResult,
  ElementItem,
  ElementKind,
  Fact,
  Release,
  Rendering,
  Role,
  Screen,
  Section,
  Stage,
} from './types';

const screenItems: Array<{ id: Screen; label: string; icon: typeof FileText }> = [
  { id: 'document', label: 'Документ', icon: FileText },
  { id: 'element', label: 'Элемент', icon: Box },
  { id: 'baselines', label: 'Базирования', icon: GitCompareArrows },
  { id: 'rendering', label: 'Рендеринг', icon: Sparkles },
  { id: 'print', label: 'Печать', icon: Printer },
];

const kindMeta: Record<ElementKind, { label: string; icon: typeof Box; help: string }> = {
  fact_ref: { label: 'Факт', icon: Database, help: 'Ссылка на проверенный факт из базы' },
  entity_ref: { label: 'Сущность', icon: Link2, help: 'Стейкхолдер, режим, сценарий или требование' },
  statement: { label: 'Тезис', icon: FileText, help: 'Одна–три фразы с опорами для чисел' },
  query: { label: 'Запрос', icon: ListFilter, help: 'Динамический перечень сущностей' },
  figure: { label: 'Фигура', icon: Image, help: 'Ссылка на иллюстрацию с подписью' },
  table: { label: 'Таблица', icon: Table2, help: 'Табличное представление запроса' },
};

const dateTime = new Intl.DateTimeFormat('ru', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function formatDate(value: string) {
  try { return dateTime.format(new Date(value)); } catch { return '—'; }
}

function describeFact(fact: Fact) {
  const value = [fact.value_text, fact.value_num, fact.value_unit].filter((item) => item !== null && item !== '').join(' ');
  return `${fact.subject} · ${fact.predicate} ${value}`;
}

function describeElement(item: ElementItem) {
  if (item.text) return item.text;
  if (item.kind === 'fact_ref' && item.resolved) return describeFact(item.resolved as Fact);
  if (item.kind === 'query') return `Выборка ${(item.query?.kind as string) ?? 'entity'} · ${(item.query?.filter as string) ?? 'без фильтра'}`;
  return `${item.resolved?.code ?? ''} · ${item.resolved?.title ?? 'Связанный объект'}`;
}

function errorCopy(error: unknown) {
  if (error instanceof ApiError) return { title: error.message, details: error.reasons, code: error.code };
  return { title: 'Не удалось выполнить действие', details: [error instanceof Error ? error.message : 'Неизвестная ошибка'], code: 'CLIENT_ERROR' };
}

type Notice = { tone: 'success' | 'error' | 'info'; title: string; details?: string[] } | null;

function Header({ demo, stage, role, onStage, onRole }: { demo: Demo; stage: Stage; role: Role; onStage: (stage: Stage) => void; onRole: (role: Role) => void }) {
  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark"><FileCheck2 size={20} strokeWidth={2.2} /></div>
        <div><strong>DocPilot</strong><span>структурные документы</span></div>
      </div>
      <div className="project-crumb"><span>{demo.document.project_name}</span><ChevronRight size={14} /><strong>{demo.document.code}</strong></div>
      <div className="header-controls">
        <div className="stage-switch" aria-label="Ступень полноты">
          {(['MCR', 'SRR'] as Stage[]).map((item) => <button key={item} className={stage === item ? 'active' : ''} onClick={() => onStage(item)}>{item}</button>)}
        </div>
        <label className="role-select"><UserRound size={15} /><span className="sr-only">Роль</span>
          <select value={role} onChange={(event) => onRole(event.target.value as Role)}>
            <option value="si">si · ведущий СИ</option>
            <option value="eng">eng · инженер</option>
            <option value="rev">rev · рецензент</option>
          </select>
        </label>
      </div>
    </header>
  );
}

function Sidebar({ screen, onScreen }: { screen: Screen; onScreen: (screen: Screen) => void }) {
  return (
    <aside className="sidebar">
      <nav aria-label="Разделы DocPilot">
        {screenItems.map((item) => {
          const Icon = item.icon;
          return <button key={item.id} className={screen === item.id ? 'active' : ''} onClick={() => onScreen(item.id)}><Icon size={18} /><span>{item.label}</span></button>;
        })}
      </nav>
      <div className="source-note"><Database size={16} /><div><strong>Источник истины</strong><span>SQLite · .sdoc только выход</span></div></div>
    </aside>
  );
}

function StatusRail({ demo, stage, loading, offline }: { demo: Demo; stage: Stage; loading: boolean; offline: boolean }) {
  const completeness = demo.document.completeness;
  return (
    <div className="status-rail" aria-live="polite">
      <span className={completeness.complete ? 'status ok' : 'status warning'}>
        {completeness.complete ? <Check size={14} /> : <CircleAlert size={14} />}
        {completeness.complete ? `${stage}: полный` : `${stage}: ${completeness.complete_sections}/${completeness.total_sections} раздела`}
      </span>
      <span className="status neutral"><LockKeyhole size={14} /> baseline: {demo.baselines[0]?.git_tag ?? 'не создан'}</span>
      <span className={demo.runtime.strictdoc ? 'status ok' : 'status warning'}><FileCheck2 size={14} /> StrictDoc: {demo.runtime.strictdoc ? 'доступен' : 'не проверен'}</span>
      <span className="status stub"><Sparkles size={14} /> STUB</span>
      {demo.document.support_drift.changed && <span className="status warning"><AlertTriangle size={14} /> опора изменилась</span>}
      {offline && <span className="offline-note">Demo-данные · API недоступен</span>}
      {loading && <RefreshCw className="spin" size={14} aria-label="Обновление" />}
    </div>
  );
}

function PageHeading({ eyebrow, title, text, action }: { eyebrow: string; title: string; text: string; action?: React.ReactNode }) {
  return <div className="page-heading"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{text}</p></div>{action}</div>;
}

function DocumentView({ demo, stage, selectedId, onSelect, onAdd, onCheck }: {
  demo: Demo; stage: Stage; selectedId: string; onSelect: (id: string) => void; onAdd: (section: Section, kind?: ElementKind) => void; onCheck: () => void;
}) {
  const section = demo.document.sections.find((item) => item.id === selectedId) ?? demo.document.sections[0];
  const missing = section.completeness.checks.find((check) => !check.satisfied);
  return (
    <section className="screen-panel">
      <PageHeading
        eyebrow={`${demo.document.code} · ${demo.document.status}`}
        title={demo.document.title}
        text="Структура, источники и полнота — в одном рабочем контексте."
        action={<div className="page-actions"><button className="secondary" onClick={onCheck}><Code2 size={15} /> Проверить .sdoc</button><button className="primary" onClick={() => onAdd(section)}><Plus size={16} /> Добавить элемент</button></div>}
      />
      {demo.document.support_drift.changed && (
        <div className="callout warning-callout"><AlertTriangle size={18} /><div><strong>Опора изменилась после базирования</strong><span>{demo.document.support_drift.items.map((item) => `${item.element_id} (${item.section}): v${item.baseline_version} → v${item.current_version}`).join(' · ')}</span></div></div>
      )}
      <div className="document-layout">
        <aside className="section-list" aria-label="Разделы документа">
          <div className="panel-label">Разделы</div>
          {demo.document.sections.map((item) => (
            <button key={item.id} className={section.id === item.id ? 'active' : ''} onClick={() => onSelect(item.id)}>
              <span className={`completion-dot ${item.completeness.complete ? 'complete' : 'incomplete'}`}>{item.completeness.complete ? <Check size={12} /> : '!'}</span>
              <span className="section-copy"><strong>{item.no} {item.title}</strong><small>{(() => { const gap = item.completeness.checks.find((check) => !check.satisfied); return gap ? `${gap.count}/${gap.min} ${gap.label} · ${stage}` : `${item.completeness.achieved}/${item.completeness.required} к ${stage}`; })()}</small></span>
              <ChevronRight size={15} />
            </button>
          ))}
        </aside>
        <div className="element-list">
          <div className="section-heading"><div><span>{section.no}</span><h2>{section.title}</h2></div><button className="secondary" onClick={() => onAdd(section)}><Plus size={15} /> Добавить</button></div>
          {section.elements.length ? section.elements.map((item) => (
            <article className="element-card" key={item.id}>
              <div className="element-topline"><span className={`kind kind-${item.kind}`}>{kindMeta[item.kind].label}</span><code>{item.id}</code><span className="version">v{item.version}</span></div>
              <p>{describeElement(item)}</p>
              <footer><span><UserRound size={13} /> {item.author}</span><span><Clock3 size={13} /> {formatDate(item.at)}</span><span className="source-version">источник v{item.ref_version ?? item.version}</span></footer>
            </article>
          )) : <div className="empty-state"><Box size={22} /><strong>В разделе пока нет элементов</strong><span>Добавьте структурный узел, чтобы заполнить ожидание шаблона.</span></div>}
          {!section.completeness.complete && (
            <button className="missing-row" onClick={() => onAdd(section, missing?.entity_kind ? 'entity_ref' : missing?.kind)}>
              <CircleAlert size={17} /><span>{missing?.message ?? 'Раздел требует дополнения'}</span><ChevronRight size={16} />
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function FieldLabel({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return <label className="field"><span className="field-title">{title}</span>{children}{hint && <small>{hint}</small>}</label>;
}

function ElementView({ demo, role, initialSectionId, initialKind, busy, onSubmit, onCreateEntity }: {
  demo: Demo; role: Role; initialSectionId: string; initialKind: ElementKind; busy: boolean;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
  onCreateEntity?: (payload: Record<string, unknown>) => Promise<string | null>;
}) {
  const [kind, setKind] = useState<ElementKind>(initialKind);
  const [sectionId, setSectionId] = useState(initialSectionId);
  const [refId, setRefId] = useState('');
  const [text, setText] = useState('');
  const [supports, setSupports] = useState<string[]>([]);
  const [filter, setFilter] = useState('status != deleted');
  const [columns, setColumns] = useState('code, title');
  const [newEntityTitle, setNewEntityTitle] = useState('');

  useEffect(() => { setSectionId(initialSectionId); }, [initialSectionId]);
  useEffect(() => { setKind(initialKind); }, [initialKind]);

  const selectedSection = demo.document.sections.find((section) => section.id === sectionId);
  const expectedKind = selectedSection?.no === '§1' ? 'stakeholder' : selectedSection?.no === '§2' ? 'mode' : selectedSection?.no === '§3' ? 'scenario' : 'requirement';
  const refs = kind === 'fact_ref' ? demo.facts : demo.entities.filter((entity) => entity.kind === expectedKind);
  const hasNumber = /\d/.test(text);
  const sentenceCount = text.trim() ? text.split(/[.!?]+/).filter(Boolean).length : 0;
  const toggleSupport = (id: string) => setSupports((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const payload: Record<string, unknown> = { section_id: sectionId, kind, author: role };
    if (kind === 'fact_ref' || kind === 'entity_ref') payload.ref_id = refId;
    if (kind === 'statement') { payload.text = text; payload.supports = supports; }
    if (kind === 'figure') { payload.text = text; payload.ref_id = refId || 'figure://pump-layout'; }
    if (kind === 'query' || kind === 'table') payload.query = { kind: 'requirement', filter, columns: columns.split(',').map((item) => item.trim()).filter(Boolean) };
    await onSubmit(payload);
    setText(''); setRefId(''); setSupports([]);
  };

  return (
    <section className="screen-panel">
      <PageHeading eyebrow="СТРУКТУРНЫЙ УЗЕЛ" title="Добавить элемент" text="Форма меняется по виду, автор и версия фиксируются автоматически." />
      <div className="element-editor">
        <div className="type-picker" role="tablist" aria-label="Вид элемента">
          {Object.entries(kindMeta).map(([id, meta]) => {
            const Icon = meta.icon;
            return <button key={id} type="button" role="tab" aria-selected={kind === id} className={kind === id ? 'active' : ''} onClick={() => { setKind(id as ElementKind); setRefId(''); }}><Icon size={17} /><span><strong>{meta.label}</strong><small>{meta.help}</small></span></button>;
          })}
        </div>
        <form className="editor-form" onSubmit={submit}>
          <div className="form-main">
            <div className="form-title"><div><span className={`kind kind-${kind}`}>{kindMeta[kind].label}</span><h2>{kindMeta[kind].help}</h2></div><code>MID · автоматически</code></div>
            <FieldLabel title="Раздел">
              <div className="select-wrap"><select value={sectionId} onChange={(event) => setSectionId(event.target.value)}>{demo.document.sections.map((section) => <option key={section.id} value={section.id}>{section.no} · {section.title}</option>)}</select><ChevronDown size={15} /></div>
            </FieldLabel>

            {(kind === 'fact_ref' || kind === 'entity_ref') && (
              <FieldLabel title={kind === 'fact_ref' ? 'Факт из базы' : 'Сущность из базы'} hint="Идентификатор нельзя вводить вручную — выберите запись.">
                <div className="picker-list">
                  {refs.map((item) => {
                    const fact = item as Fact;
                    const entity = item as Demo['entities'][number];
                    const label = kind === 'fact_ref' ? describeFact(fact) : `${entity.code} · ${entity.title}`;
                    const meta = kind === 'fact_ref' ? `${fact.source_doc} · ${fact.mark}` : entity.kind;
                    return <button type="button" key={item.id} className={refId === item.id ? 'selected' : ''} onClick={() => setRefId(item.id)}><span className="radio-dot">{refId === item.id && <Check size={11} />}</span><span><strong>{label}</strong><small>{meta}</small></span></button>;
                  })}
                </div>
                {kind === 'entity_ref' && (
                  <div className="quick-create">
                    <input value={newEntityTitle} onChange={(event) => setNewEntityTitle(event.target.value)} placeholder={`Новый ${expectedKind === 'scenario' ? 'сценарий' : 'объект'}…`} />
                    <button type="button" className="secondary" disabled={!newEntityTitle.trim() || busy || !onCreateEntity} onClick={async () => {
                      const prefix = expectedKind === 'scenario' ? 'SCN' : expectedKind === 'mode' ? 'MODE' : expectedKind === 'stakeholder' ? 'ST' : 'RQ';
                      const id = await onCreateEntity?.({ kind: expectedKind, code: `${prefix}-${String(refs.length + 1).padStart(2, '0')}`, title: newEntityTitle.trim(), fields: { description: 'добавлено в тестовом сценарии' } });
                      if (id) { setRefId(id); setNewEntityTitle(''); }
                    }}><Plus size={14} /> Создать</button>
                  </div>
                )}
              </FieldLabel>
            )}

            {kind === 'statement' && (
              <>
                <FieldLabel title="Текст тезиса" hint={`${sentenceCount}/3 предложения`}>
                  <textarea rows={6} value={text} onChange={(event) => setText(event.target.value)} placeholder="Опишите одно проверяемое положение документа…" />
                </FieldLabel>
                {hasNumber && !supports.length && <div className="inline-error"><CircleAlert size={16} /><span><strong>Число требует основания.</strong> Выберите факт или сущность ниже.</span></div>}
                <FieldLabel title="Опоры" hint="Обязательны, если в тезисе есть числа.">
                  <div className="support-grid">
                    {demo.facts.map((fact) => <button type="button" key={fact.id} className={supports.includes(fact.id) ? 'selected' : ''} onClick={() => toggleSupport(fact.id)}><span>{supports.includes(fact.id) ? <Check size={12} /> : <Plus size={12} />}</span>{fact.id} · {fact.value_num} {fact.value_unit}</button>)}
                  </div>
                </FieldLabel>
              </>
            )}

            {kind === 'figure' && <FieldLabel title="Подпись"><input value={text} onChange={(event) => setText(event.target.value)} placeholder="Функциональная схема насосной станции" /></FieldLabel>}

            {(kind === 'query' || kind === 'table') && (
              <div className="two-fields">
                <FieldLabel title="Фильтр"><input value={filter} onChange={(event) => setFilter(event.target.value)} /></FieldLabel>
                <FieldLabel title="Колонки"><input value={columns} onChange={(event) => setColumns(event.target.value)} /></FieldLabel>
              </div>
            )}
          </div>
          <aside className="editor-context">
            <span className="panel-label">Контекст</span>
            <h3>{selectedSection?.no} {selectedSection?.title}</h3>
            <dl><div><dt>Автор</dt><dd>{role}</dd></div><div><dt>Версия</dt><dd>v1</dd></div><div><dt>Валидация</dt><dd>{hasNumber && !supports.length && kind === 'statement' ? 'не пройдена' : 'готово'}</dd></div></dl>
            <div className="context-rule"><ShieldCheck size={18} /><p>Число попадёт в изложение только вместе со ссылкой на этот элемент.</p></div>
            <button className="primary wide" disabled={busy || ((kind === 'fact_ref' || kind === 'entity_ref') && !refId)}>{busy ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />} Сохранить элемент</button>
          </aside>
        </form>
      </div>
    </section>
  );
}

function BaselinesView({ baselines, role, busy, onCreate, onDiff }: {
  baselines: Baseline[]; role: Role; busy: boolean; onCreate: (name: string) => Promise<void>; onDiff: (from: string, to: string) => Promise<DiffResult>;
}) {
  const [name, setName] = useState('MCR');
  const [selected, setSelected] = useState<string[]>([]);
  const [diff, setDiff] = useState<DiffResult | null>(null);
  const [diffBusy, setDiffBusy] = useState(false);

  const toggle = (id: string) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current.slice(-1), id]);
  const compare = async () => {
    if (selected.length !== 2) return;
    setDiffBusy(true);
    try { setDiff(await onDiff(selected[0], selected[1])); } finally { setDiffBusy(false); }
  };
  return (
    <section className="screen-panel">
      <PageHeading eyebrow="НЕИЗМЕНЯЕМЫЕ СРЕЗЫ" title="Базирования" text="Коммит и тег фиксируют версии элементов и их опор." />
      <div className="baseline-create card-surface">
        <div><LockKeyhole size={19} /><span><strong>Новое базирование</strong><small>Только ведущий СИ · будет создан Git tag</small></span></div>
        <input value={name} onChange={(event) => setName(event.target.value)} aria-label="Имя базирования" />
        <button className="primary" disabled={busy || role !== 'si'} onClick={() => onCreate(name)}>{busy ? <LoaderCircle className="spin" size={16} /> : <GitCommitHorizontal size={16} />} Базировать</button>
      </div>
      {role !== 'si' && <div className="permission-note"><Info size={15} /> Переключитесь на роль si, чтобы создать базирование.</div>}
      <div className="table-card">
        <div className="table-toolbar"><strong>История</strong><span>Выберите два среза</span><button className="secondary" disabled={selected.length !== 2 || diffBusy} onClick={compare}>{diffBusy ? <LoaderCircle className="spin" size={15} /> : <GitCompareArrows size={15} />} Сравнить</button></div>
        {baselines.length ? (
          <div className="data-table" role="table">
            <div className="data-row data-head" role="row"><span></span><span>Тег</span><span>Автор</span><span>Создано</span><span>Git hash</span><span>Узлов</span></div>
            {baselines.map((baseline) => <button className={`data-row ${selected.includes(baseline.id) ? 'selected' : ''}`} role="row" key={baseline.id} onClick={() => toggle(baseline.id)}><span className="checkbox">{selected.includes(baseline.id) && <Check size={12} />}</span><strong><LockKeyhole size={12} />{baseline.git_tag}</strong><span>{baseline.by}</span><span>{formatDate(baseline.at)}</span><code>{baseline.commit_hash.slice(0, 8)}</code><span>{baseline.items.filter((item) => item.type === 'element').length}</span></button>)}
          </div>
        ) : <div className="empty-state compact"><GitCommitHorizontal size={22} /><strong>Базирований пока нет</strong><span>Создайте первый неизменяемый срез структуры.</span></div>}
      </div>
      {diff && (
        <div className="diff-card card-surface">
          <div className="diff-heading"><div><span className="eyebrow">MID DIFF</span><h2>{diff.from} → {diff.to}</h2></div><code>{diff.strategy}</code></div>
          <div className="diff-summary"><div className="added"><strong>{diff.summary.added}</strong><span>добавлено</span></div><div className="changed"><strong>{diff.summary.changed}</strong><span>изменено</span></div><div className="removed"><strong>{diff.summary.removed}</strong><span>удалено</span></div></div>
          {!diff.summary.added && !diff.summary.changed && !diff.summary.removed && <p className="muted-copy">Структурные узлы совпадают.</p>}
          {diff.changed.map((item) => <article className="diff-node" key={item.mid}><header><code>{item.mid}</code><span>{item.author}</span></header>{item.fields.map((field) => <div className="field-diff" key={field.field}><strong>{field.field}</strong><del>{String(field.from ?? '—')}</del><ins>{String(field.to ?? '—')}</ins></div>)}</article>)}
          {diff.added.map((item) => <article className="diff-node added-node" key={`add-${item.mid}`}><header><code>+ {item.mid}</code><span>{item.author}</span></header><p>Узел добавлен</p></article>)}
          {diff.removed.map((item) => <article className="diff-node removed-node" key={`remove-${item.mid}`}><header><code>− {item.mid}</code><span>{item.author}</span></header><p>Узел удалён</p></article>)}
        </div>
      )}
    </section>
  );
}

function LinkedText({ text, activeMid, onActive }: { text: string; activeMid: string | null; onActive: (mid: string | null) => void }) {
  const chunks = text.split(/(\[EL-\d{3}\])/g);
  return <>{chunks.map((chunk, index) => /^\[EL-\d{3}\]$/.test(chunk) ? <button key={`${chunk}-${index}`} className={`mid-link ${activeMid === chunk.slice(1, -1) ? 'active' : ''}`} onMouseEnter={() => onActive(chunk.slice(1, -1))} onMouseLeave={() => onActive(null)} onFocus={() => onActive(chunk.slice(1, -1))} onBlur={() => onActive(null)}>{chunk}</button> : chunk)}</>;
}

function RenderingView({ demo, role, busy, onGenerate, onReview, onAccept }: {
  demo: Demo; role: Role; busy: boolean;
  onGenerate: (baseline: string | null) => Promise<void>;
  onReview: (rendering: Rendering, no: string, text: string) => Promise<void>;
  onAccept: (rendering: Rendering) => Promise<void>;
}) {
  const [baseline, setBaseline] = useState(demo.baselines[0]?.id ?? '');
  const [renderingId, setRenderingId] = useState(demo.renderings[0]?.id ?? '');
  const [activeMid, setActiveMid] = useState<string | null>(null);
  const [reviewMode, setReviewMode] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  useEffect(() => { if (demo.renderings[0]) setRenderingId(demo.renderings[0].id); }, [demo.renderings[0]?.id]);
  useEffect(() => { if (!baseline && demo.baselines[0]) setBaseline(demo.baselines[0].id); }, [demo.baselines, baseline]);
  const rendering = demo.renderings.find((item) => item.id === renderingId) ?? demo.renderings[0];
  useEffect(() => { if (rendering?.accepted_at) setReviewMode(false); }, [rendering?.accepted_at]);
  const sourceElements = useMemo<Record<string, ElementItem>>(() => {
    const result: Record<string, ElementItem> = {};
    rendering?.sections.forEach((section) => section.element_links.forEach((link) => {
      if (link.source) result[link.source.id] = link.source;
    }));
    if (!Object.keys(result).length) {
      demo.document.sections.forEach((section) => section.elements.forEach((item) => { result[item.id] = item; }));
    }
    return result;
  }, [demo.document.sections, rendering]);
  const dirtyReview = Boolean(rendering && reviewMode && rendering.sections.some((section) => (drafts[section.no] ?? section.text) !== section.text));
  const enterReview = () => { if (!rendering) return; setDrafts(Object.fromEntries(rendering.sections.map((section) => [section.no, section.text]))); setReviewMode(true); };

  return (
    <section className="screen-panel rendering-screen">
      <PageHeading eyebrow="ИЗЛОЖЕНИЕ ИЗ ЭЛЕМЕНТОВ" title="Рендеринг" text="STUB получает только элементы раздела и сохраняет ссылки [MID]." action={<div className="page-actions"><div className="select-wrap compact-select"><select value={baseline} onChange={(event) => setBaseline(event.target.value)}><option value="">Текущая версия</option>{demo.baselines.map((item) => <option key={item.id} value={item.id}>{item.git_tag}</option>)}</select><ChevronDown size={14} /></div><button className="primary" disabled={busy} onClick={() => onGenerate(baseline || null)}>{busy ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />} Сгенерировать</button></div>} />
      {rendering ? (
        <>
          <div className="render-meta card-surface">
            <div><span className="engine-badge"><Sparkles size={13} />{rendering.engine.toUpperCase()}</span><span>Версия {rendering.version}</span><span><Hash size={13} />{rendering.prompt_fingerprint}</span></div>
            <div><select value={rendering.id} onChange={(event) => setRenderingId(event.target.value)} aria-label="Версия рендеринга">{demo.renderings.map((item) => <option key={item.id} value={item.id}>v{item.version} · {formatDate(item.created_at)}</option>)}</select>{rendering.accepted_at ? <span className="accepted"><CheckCircle2 size={14} /> принят {formatDate(rendering.accepted_at)}</span> : <button className="secondary" disabled={role !== 'rev'} onClick={enterReview}><PencilLine size={14} /> Рецензировать</button>}</div>
          </div>
          {role !== 'rev' && !rendering.accepted_at && <div className="permission-note"><Info size={15} /> Режим рецензии и принятие доступны роли rev.</div>}
          {rendering.text_diff?.from_rendering && (
            <details className="render-diff card-surface">
              <summary><GitCompareArrows size={15} /> Диф с {rendering.text_diff.from_rendering}: {rendering.text_diff.summary.changed_sections} раздела</summary>
              {rendering.text_diff.sections.length ? rendering.text_diff.sections.map((item) => <div key={item.no}><strong>{item.no}</strong><pre>{item.patch}</pre></div>) : <p>Текст совпадает; зафиксирована новая версия рендеринга.</p>}
            </details>
          )}
          <div className="render-layout">
            <div className="prose-sheet">
              {rendering.sections.map((section) => <section className="render-section" key={section.no}><header><span>{section.no}</span><h2>{section.title}</h2>{reviewMode && <button className="secondary small" disabled={busy || (drafts[section.no] ?? section.text) === section.text} onClick={() => onReview(rendering, section.no, drafts[section.no] ?? section.text)}><Save size={13} /> Сохранить раздел</button>}</header>{reviewMode ? <textarea aria-label={`Текст рецензии ${section.no}`} rows={Math.max(5, section.text.split('\n').length + 2)} value={drafts[section.no] ?? section.text} onChange={(event) => setDrafts((current) => ({ ...current, [section.no]: event.target.value }))} /> : <p><LinkedText text={section.text} activeMid={activeMid} onActive={setActiveMid} /></p>}</section>)}
              {reviewMode && <div className="review-footer"><div><ShieldCheck size={17} /><span>{dirtyReview ? 'Сначала сохраните изменённые разделы.' : 'Порядок слов можно менять. Числа и ссылки [MID] защищены.'}</span></div><button className="primary" disabled={role !== 'rev' || dirtyReview || busy} onClick={() => onAccept(rendering)}><Check size={15} /> Принять рендеринг</button></div>}
            </div>
            <aside className="trace-panel"><span className="panel-label">Источник утверждения</span>{activeMid && sourceElements[activeMid] ? <div className="trace-card"><code>{activeMid}</code><span className={`kind kind-${sourceElements[activeMid].kind}`}>{kindMeta[sourceElements[activeMid].kind].label}</span><p>{describeElement(sourceElements[activeMid])}</p><small>{sourceElements[activeMid].author} · v{sourceElements[activeMid].version}</small></div> : <div className="trace-empty"><Link2 size={21} /><span>Наведите на [MID], чтобы увидеть исходный элемент.</span></div>}<div className="trace-rule"><Braces size={17} /><p>Каждое число проверяется по данным элемента до сохранения текста.</p></div></aside>
          </div>
        </>
      ) : <div className="empty-state hero-empty"><Sparkles size={27} /><strong>Рендеринга ещё нет</strong><span>Создайте baseline или используйте текущую структуру, затем запустите STUB.</span><button className="primary" onClick={() => onGenerate(null)}>Сгенерировать предпросмотр</button></div>}
    </section>
  );
}

function PrintView({ demo, role, busy, onRelease }: { demo: Demo; role: Role; busy: boolean; onRelease: (rendering: Rendering, docx: boolean) => Promise<void> }) {
  const accepted = demo.renderings.filter((item) => item.accepted_at && item.baseline_id);
  const [renderingId, setRenderingId] = useState(accepted[0]?.id ?? '');
  const [docx, setDocx] = useState(false);
  useEffect(() => { if (!renderingId && accepted[0]) setRenderingId(accepted[0].id); }, [accepted, renderingId]);
  const rendering = accepted.find((item) => item.id === renderingId);
  const baseline = demo.baselines.find((item) => item.id === rendering?.baseline_id);
  return (
    <section className="screen-panel">
      <PageHeading eyebrow="ПАКЕТ ТОЧКИ" title="Печать и выпуск" text="Два PDF-пути, вычисленные авторы и блок подписей." />
      {!accepted.length ? <div className="callout blocker"><LockKeyhole size={19} /><div><strong>Выпуск заблокирован</strong><span>Сначала рецензент должен принять хотя бы один рендеринг.</span></div></div> : (
        <div className="release-builder">
          <div className="format-options card-surface">
            <div className="format-heading"><span className="panel-label">Форматы</span><h2>Собрать выпуск</h2></div>
            <label className="format-row selected"><span className="format-icon"><FileText size={19} /></span><span><strong>HTML → PDF</strong><small>Основной маршрут StrictDoc</small></span><CheckCircle2 size={18} /></label>
            <label className="format-row selected"><span className="format-icon"><FileCode2 size={19} /></span><span><strong>Typst PDF</strong><small>Титул и блок подписей</small></span><CheckCircle2 size={18} /></label>
            <label className={`format-row ${docx ? 'selected' : ''}`}><input type="checkbox" checked={docx} onChange={(event) => setDocx(event.target.checked)} /><span className="format-icon"><FileText size={19} /></span><span><strong>DOCX <em>P1</em></strong><small>Редактируемая копия</small></span>{docx && <CheckCircle2 size={18} />}</label>
          </div>
          <div className="release-passport card-surface"><span className="panel-label">Паспорт выпуска</span><h2>{demo.document.title}</h2><dl><div><dt>Рендеринг</dt><dd><select value={renderingId} onChange={(event) => setRenderingId(event.target.value)}>{accepted.map((item) => <option key={item.id} value={item.id}>v{item.version} · {formatDate(item.accepted_at!)}</option>)}</select></dd></div><div><dt>Базирование</dt><dd><code>{baseline?.git_tag ?? '—'}</code></dd></div><div><dt>Рецензент</dt><dd>{rendering?.reviewer ?? 'rev'}</dd></div><div><dt>Выпускает</dt><dd>{role}</dd></div></dl><div className="author-preview"><span>Авторы из элементов baseline + рецензент + выпустивший</span><div>{[...(baseline?.authors ?? []), rendering?.reviewer ?? 'rev', role].filter((item, index, all) => all.indexOf(item) === index).map((author) => <span key={author}><UserRound size={12} />{author}</span>)}</div></div><button className="primary wide" disabled={!rendering || busy} onClick={() => rendering && onRelease(rendering, docx)}>{busy ? <LoaderCircle className="spin" size={16} /> : <Printer size={16} />} Выпустить пакет</button></div>
        </div>
      )}
      <div className="release-history table-card"><div className="table-toolbar"><strong>История выпусков</strong><span>{demo.releases.length} пакета</span></div>{demo.releases.length ? demo.releases.map((release) => <ReleaseRow key={release.id} release={release} />) : <div className="empty-state compact"><Printer size={22} /><strong>Готовых пакетов нет</strong><span>После выпуска здесь появятся файлы и авторы.</span></div>}</div>
    </section>
  );
}

function ReleaseRow({ release }: { release: Release }) {
  const labels: Record<string, string> = { pdf_html2pdf: 'HTML PDF', pdf_typst: 'Typst PDF', docx: 'DOCX', html: 'HTML' };
  return <article className="release-row"><div className="release-main"><span className="success-icon"><Check size={14} /></span><span><strong>{release.id}</strong><small>{formatDate(release.at)} · {release.authors.join(', ')}</small></span></div><div className="file-actions">{Object.entries(release.files).filter(([, file]) => file.path).map(([key, file]) => <a key={key} href={`/api/releases/${release.id}/files/${key}`}><ArrowDownToLine size={13} />{labels[key] ?? key}<small>{file.mode}</small></a>)}</div></article>;
}

function NoticeBar({ notice, onClose }: { notice: Notice; onClose: () => void }) {
  if (!notice) return null;
  return <div className={`notice ${notice.tone}`} role="status"><span>{notice.tone === 'success' ? <CheckCircle2 size={18} /> : notice.tone === 'error' ? <CircleAlert size={18} /> : <Info size={18} />}</span><div><strong>{notice.title}</strong>{notice.details?.map((detail) => <small key={detail}>{detail}</small>)}</div><button onClick={onClose} aria-label="Закрыть"><X size={16} /></button></div>;
}

function App() {
  const [screen, setScreen] = useState<Screen>('document');
  const [stage, setStage] = useState<Stage>('SRR');
  const [role, setRole] = useState<Role>('si');
  const [demo, setDemo] = useState<Demo>(fallbackDemo);
  const [selectedSectionId, setSelectedSectionId] = useState('sec-3');
  const [draftKind, setDraftKind] = useState<ElementKind>('entity_ref');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const reload = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const payload = await api<Demo>(`/api/demo?stage=${stage}`);
      setDemo(payload); setOffline(false);
    } catch {
      setOffline(true);
    } finally { setLoading(false); }
  }, [stage]);

  useEffect(() => { void reload(); }, [reload]);

  const perform = async (action: () => Promise<void>, success: string) => {
    setBusy(true); setNotice(null);
    try { await action(); await reload(true); setNotice({ tone: 'success', title: success }); }
    catch (error) { const copy = errorCopy(error); setNotice({ tone: 'error', title: copy.title, details: copy.details }); }
    finally { setBusy(false); }
  };

  const openAdd = (section: Section, kind: ElementKind = 'statement') => { setSelectedSectionId(section.id); setDraftKind(kind); setScreen('element'); };

  const checkSdoc = async () => {
    setBusy(true); setNotice(null);
    try {
      const result = await api<{ verified: boolean; message: string }>(`/api/documents/${demo.document.id}/sdoc/check`);
      setNotice(result.verified
        ? { tone: 'success', title: 'StrictDoc разобрал .sdoc без ошибок' }
        : { tone: 'info', title: 'Файл создан, но StrictDoc CLI недоступен', details: [result.message] });
    } catch (error) {
      const copy = errorCopy(error); setNotice({ tone: 'error', title: copy.title, details: copy.details });
    } finally { setBusy(false); }
  };

  return (
    <div className="app-shell">
      <Header demo={demo} stage={stage} role={role} onStage={setStage} onRole={setRole} />
      <Sidebar screen={screen} onScreen={setScreen} />
      <main className="workspace">
        <StatusRail demo={demo} stage={stage} loading={loading} offline={offline} />
        <NoticeBar notice={notice} onClose={() => setNotice(null)} />
        {screen === 'document' && <DocumentView demo={demo} stage={stage} selectedId={selectedSectionId} onSelect={setSelectedSectionId} onAdd={openAdd} onCheck={() => void checkSdoc()} />}
        {screen === 'element' && <ElementView key={`${selectedSectionId}-${draftKind}`} demo={demo} role={role} initialSectionId={selectedSectionId} initialKind={draftKind} busy={busy} onSubmit={(payload) => perform(async () => { await api(`/api/documents/${demo.document.id}/elements`, { method: 'POST', body: JSON.stringify(payload) }); setScreen('document'); }, 'Элемент добавлен и .sdoc обновлён')} onCreateEntity={async (payload) => {
          setBusy(true); setNotice(null);
          try {
            const created = await api<{ id: string }>('/api/entities', { method: 'POST', body: JSON.stringify(payload) });
            await reload(true); setNotice({ tone: 'success', title: 'Сущность создана — теперь добавьте её в документ' }); return created.id;
          } catch (error) {
            const copy = errorCopy(error); setNotice({ tone: 'error', title: copy.title, details: copy.details }); return null;
          } finally { setBusy(false); }
        }} />}
        {screen === 'baselines' && <BaselinesView baselines={demo.baselines} role={role} busy={busy} onCreate={(name) => perform(async () => { await api(`/api/documents/${demo.document.id}/baseline`, { method: 'POST', body: JSON.stringify({ name, by: role }) }); }, 'Создан неизменяемый baseline')} onDiff={(from, to) => api(`/api/documents/${demo.document.id}/diff?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)} />}
        {screen === 'rendering' && <RenderingView demo={demo} role={role} busy={busy} onGenerate={(baseline) => perform(async () => { await api(`/api/documents/${demo.document.id}/render`, { method: 'POST', body: JSON.stringify({ baseline, by: role }) }); }, 'STUB-рендеринг создан и закоммичен')} onReview={(rendering, no, text) => perform(async () => { await api(`/api/renderings/${rendering.id}/section/${encodeURIComponent(no)}`, { method: 'PUT', body: JSON.stringify({ text, reviewer: role }) }); }, 'Патч изложения сохранён')} onAccept={(rendering) => perform(async () => { await api(`/api/renderings/${rendering.id}/accept`, { method: 'POST', body: JSON.stringify({ reviewer: role }) }); }, 'Рендеринг принят')} />}
        {screen === 'print' && <PrintView demo={demo} role={role} busy={busy} onRelease={(rendering, includeDocx) => perform(async () => { await api('/api/release', { method: 'POST', body: JSON.stringify({ rendering_id: rendering.id, released_by: role, include_docx: includeDocx }) }); }, 'Пакет выпуска сформирован')} />}
      </main>
    </div>
  );
}

export default App;
