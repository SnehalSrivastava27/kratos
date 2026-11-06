// An artifact the team pinned to /gallery/: images as a thumbnail, documents (.pptx/.xlsx/.docx/.pdf) as a file chip.
import { Download, ExternalLink, File, FileSpreadsheet, FileText, Presentation, type LucideIcon } from 'lucide-react';

const KIND: Record<string, { Icon: LucideIcon; label: string; color: string }> = {
  pptx: { Icon: Presentation, label: 'PowerPoint', color: '#C2410C' },
  xlsx: { Icon: FileSpreadsheet, label: 'Excel', color: '#15803D' },
  csv: { Icon: FileSpreadsheet, label: 'CSV', color: '#15803D' },
  docx: { Icon: FileText, label: 'Word', color: '#1D4ED8' },
  pdf: { Icon: FileText, label: 'PDF', color: '#B91C1C' },
};
const IMAGE = /\.(png|svg|jpe?g|webp|gif)$/i;
export const extOf = (url: string) => url.split('?')[0].split('.').pop()?.toLowerCase() ?? '';
export const isImage = (url: string) => IMAGE.test(url.split('?')[0]);
/** .html banners keep the gallery card; everything else is a file. */
export const isFile = (url: string) => !/\.html?$/i.test(url.split('?')[0]);

export function FileChip({ url, title }: { url: string; title?: string }) {
  const name = decodeURIComponent(url.split('/').pop() ?? url);
  if (isImage(url))
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="mt-1.5 block overflow-hidden rounded-lg border border-black/[0.08] bg-[#F4F4F5]" title={title ?? name}>
        <img src={url} alt={title ?? name} loading="lazy" className="block max-h-56 w-full object-contain" />
        <div className="flex items-center gap-1 truncate px-2 py-1 text-xs text-[#707579]">{name} <ExternalLink className="size-3 shrink-0" /></div>
      </a>
    );
  const ext = extOf(url);
  const k = KIND[ext] ?? { Icon: File, label: ext.toUpperCase() || 'File', color: '#475569' };
  return (
    <div className="mt-1.5 flex items-center gap-2.5 rounded-lg border border-black/[0.08] bg-[#F7F7F8] p-2">
      <span className="grid size-10 shrink-0 place-items-center rounded-md" style={{ background: `${k.color}14`, color: k.color }}>
        <k.Icon className="size-5" strokeWidth={1.75} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px] font-semibold text-black" title={name}>{name}</div>
        <div className="text-xs text-[#707579]">{k.label}{title ? ` · ${title}` : ''}</div>
      </div>
      <a href={url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${name}`} title="Open" className="grid size-8 shrink-0 place-items-center rounded-full text-[#3390EC] hover:bg-[#3390EC]/10">
        <ExternalLink className="size-4" />
      </a>
      <a href={url} download={name} aria-label={`Download ${name}`} title="Download" className="grid size-8 shrink-0 place-items-center rounded-full text-[#3390EC] hover:bg-[#3390EC]/10">
        <Download className="size-4" />
      </a>
    </div>
  );
}
