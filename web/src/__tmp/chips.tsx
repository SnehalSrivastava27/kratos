import { createRoot } from 'react-dom/client';
import '../index.css';
import '../office/office.css';
import { FileChip } from '../office/FileChip';
import { KpiPanel } from '../office/KpiPanel';
const urls = ['/gallery/festive-plan.pptx', '/gallery/budget-split.xlsx', '/gallery/creator-brief.docx', '/gallery/pnl-oct.pdf', '/gallery/hero.svg'];
createRoot(document.getElementById('root')!).render(
  <div className="hq-root" style={{ display: 'flex', gap: 24, padding: 16, flexWrap: 'wrap', background: '#e7f3d8', minHeight: '100vh' }}>
    <div style={{ width: 360, background: '#fff', padding: 12, borderRadius: 16 }}>{urls.map((u) => <FileChip key={u} url={u} />)}</div>
    <div style={{ position: 'relative', width: 340, height: 600 }}><KpiPanel onClose={() => {}} style={{ top: 0, left: 0 }} /></div>
  </div>,
);
