export type Screen = 'document' | 'element' | 'baselines' | 'rendering' | 'print';
export type Stage = 'MCR' | 'SRR';
export type Role = 'si' | 'eng' | 'rev';
export type ElementKind = 'fact_ref' | 'entity_ref' | 'statement' | 'query' | 'figure' | 'table';

export type Fact = {
  id: string;
  subject: string;
  predicate: string;
  value_num: number | null;
  value_unit: string | null;
  value_text: string | null;
  source_doc: string;
  source_anchor: string;
  mark: 'И' | 'В' | 'П';
  disposition: string;
  author: string;
  at: string;
  version: number;
};

export type Entity = {
  id: string;
  kind: 'stakeholder' | 'scenario' | 'mode' | 'requirement';
  code: string;
  title: string;
  fields: Record<string, string>;
  version: number;
};

export type ElementItem = {
  id: string;
  section_id: string;
  kind: ElementKind;
  ref_id?: string | null;
  ref_version?: number | null;
  text?: string | null;
  supports: string[];
  query?: Record<string, unknown> | null;
  author: string;
  at: string;
  sort_order: number;
  version: number;
  resolved?: (Fact & Partial<Entity>) | (Entity & Partial<Fact>) | null;
};

export type CompletenessCheck = {
  kind: ElementKind;
  entity_kind?: string | null;
  label: string;
  count: number;
  min: number;
  missing: number;
  satisfied: boolean;
  message?: string | null;
};

export type Section = {
  id: string;
  document_id: string;
  no: string;
  title: string;
  sort_order: number;
  elements: ElementItem[];
  completeness: {
    stage: Stage;
    achieved: number;
    required: number;
    complete: boolean;
    checks: CompletenessCheck[];
  };
};

export type DocumentData = {
  id: string;
  project_id: string;
  project_name: string;
  code: string;
  title: string;
  owner: string;
  status: 'Draft' | 'Baseline';
  sections: Section[];
  stage: Stage;
  completeness: { complete_sections: number; total_sections: number; complete: boolean };
  support_drift: {
    changed: boolean;
    items: Array<{ element_id: string; ref_id: string; section: string; baseline_version: number; current_version: number }>;
  };
};

export type Baseline = {
  id: string;
  document_id: string;
  name: string;
  git_tag: string;
  items: Array<{ type: string; id: string; version: number }>;
  by: string;
  at: string;
  commit_hash: string;
  authors: string[];
};

export type RenderSection = {
  no: string;
  title: string;
  text: string;
  element_links: Array<{ mids: string[]; label: string; source?: ElementItem }>;
};

export type RenderTextDiff = {
  from_rendering: string | null;
  summary: { changed_sections: number };
  sections: Array<{ no: string; patch: string }>;
};

export type Rendering = {
  id: string;
  document_id: string;
  baseline_id: string | null;
  sections: RenderSection[];
  engine: 'stub' | 'llm';
  model: string | null;
  prompt_fingerprint: string;
  patches: Array<{ section: string; author: string; at: string; patch: string }>;
  reviewer: string | null;
  accepted_at: string | null;
  created_at: string;
  version: number;
  text_diff: RenderTextDiff;
};

export type ReleaseFile = { path: string | null; mode: string };
export type Release = {
  id: string;
  rendering_id: string;
  files: Record<string, ReleaseFile>;
  authors: string[];
  released_by: string;
  at: string;
};

export type Runtime = {
  status: string;
  service: string;
  render_engine: string;
  strictdoc: boolean;
  typst: boolean;
};

export type Demo = {
  document: DocumentData;
  facts: Fact[];
  entities: Entity[];
  baselines: Baseline[];
  renderings: Rendering[];
  releases: Release[];
  runtime: Runtime;
};

export type DiffResult = {
  from: string;
  to: string;
  summary: { added: number; changed: number; removed: number };
  added: Array<{ mid: string; author: string }>;
  changed: Array<{ mid: string; author: string; fields: Array<{ field: string; from: unknown; to: unknown }> }>;
  removed: Array<{ mid: string; author: string }>;
  strategy: string;
};

export type ApiFailure = { code: string; message: string; reasons: string[] };
