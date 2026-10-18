/** Server-safe campaign bits (no hooks), shared by the list page and the editor. */
import { Badge } from '@/components/ui';
import type { CampaignStatus } from '@/lib/campaign';
import type { Tone } from '@/components/admin/bits';

const STATUS: Record<CampaignStatus, { label: string; tone: Tone; hint: string }> = {
  LIVE: { label: 'Live', tone: 'green', hint: 'Running now' },
  TEASER: { label: 'Teaser', tone: 'amber', hint: 'Counting down to the start' },
  SCHEDULED: { label: 'Scheduled', tone: 'blue', hint: 'Starts later' },
  ENDED: { label: 'Ended', tone: 'neutral', hint: 'Finished' },
  OFF: { label: 'Off', tone: 'red', hint: 'Switched off, never shown' },
};

export function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  const s = STATUS[status] ?? STATUS.OFF;
  return (
    <Badge tone={s.tone} className="whitespace-nowrap">
      <span title={s.hint}>{s.label}</span>
    </Badge>
  );
}

/** Light checkerboard so transparent banner art reads as transparent. */
export const CHECKER_STYLE = {
  backgroundColor: '#fff',
  backgroundImage:
    'linear-gradient(45deg, #eef0ed 25%, transparent 25%), linear-gradient(-45deg, #eef0ed 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #eef0ed 75%), linear-gradient(-45deg, transparent 75%, #eef0ed 75%)',
  backgroundSize: '16px 16px',
  backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0',
} as const;
