import type { Demo } from './types';

const at = '2026-09-05T09:00:00+03:00';

export const fallbackDemo: Demo = {
  document: {
    id: 'doc-conops', project_id: 'project-pump', project_name: 'Насосная станция · концепция',
    code: 'ConOps', title: 'Концепция эксплуатации насосной станции', owner: 'si', status: 'Draft', stage: 'SRR',
    completeness: { complete_sections: 3, total_sections: 4, complete: false },
    support_drift: { changed: false, items: [] },
    sections: [
      {
        id: 'sec-1', document_id: 'doc-conops', no: '§1', title: 'Назначение и контекст', sort_order: 1,
        completeness: { stage: 'SRR', achieved: 3, required: 3, complete: true, checks: [] },
        elements: [
          { id: 'EL-001', section_id: 'sec-1', kind: 'statement', text: 'Система предназначена для надёжного водоснабжения района и управляется из диспетчерской.', supports: [], author: 'si', at, sort_order: 1, version: 1 },
          { id: 'EL-002', section_id: 'sec-1', kind: 'entity_ref', ref_id: 'ent-st-operator', ref_version: 1, supports: [], author: 'si', at, sort_order: 2, version: 1, resolved: { id: 'ent-st-operator', kind: 'stakeholder', code: 'ST-01', title: 'Диспетчер', fields: {}, version: 1 } },
          { id: 'EL-003', section_id: 'sec-1', kind: 'entity_ref', ref_id: 'ent-st-service', ref_version: 1, supports: [], author: 'eng', at, sort_order: 3, version: 1, resolved: { id: 'ent-st-service', kind: 'stakeholder', code: 'ST-02', title: 'Служба эксплуатации', fields: {}, version: 1 } },
        ],
      },
      { id: 'sec-2', document_id: 'doc-conops', no: '§2', title: 'Режимы и состояния', sort_order: 2, completeness: { stage: 'SRR', achieved: 3, required: 3, complete: true, checks: [] }, elements: [] },
      { id: 'sec-3', document_id: 'doc-conops', no: '§3', title: 'Операционные сценарии', sort_order: 3, completeness: { stage: 'SRR', achieved: 3, required: 4, complete: false, checks: [{ kind: 'entity_ref', entity_kind: 'scenario', label: 'сценария', count: 2, min: 3, missing: 1, satisfied: false, message: 'Нужно: ещё 1 сценария → добавить' }] }, elements: [] },
      { id: 'sec-4', document_id: 'doc-conops', no: '§4', title: 'Среда и ограничения', sort_order: 4, completeness: { stage: 'SRR', achieved: 3, required: 3, complete: true, checks: [] }, elements: [] },
    ],
  },
  facts: [], entities: [], baselines: [], renderings: [], releases: [],
  runtime: { status: 'offline', service: 'DocPilot', render_engine: 'stub', strictdoc: false, typst: false },
};

