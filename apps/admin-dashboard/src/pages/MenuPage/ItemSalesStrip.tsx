import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BellRing, MessageCircleQuestion, Star, TrendingDown, TrendingUp } from 'lucide-react';
import { fetchItemBrief, type ItemBrief } from '../../api';
import { InlineIcon } from '../../components/SharedUI';

/**
 * A dish's sales at a glance, on top of its own pop-up (owner, 2026-11-24: "a
 * brief summary of the item in admin each item details. Like total sold"). The
 * figures come from the item's page in Reports → Items Sold, which the link
 * opens, so the two never disagree. Shown only to someone who may open the
 * reports; it loads after the pop-up, so opening an item stays quick.
 */

const num = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 2 });
const money = (v: number) => `MVR ${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** "today", "yesterday", "12 days ago", then the date itself once it is long ago. */
export function agoWords(day: string, today: string): string {
  const days = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 60) return `${days} days ago`;
  return new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** Up or down against the 30 days before, in whole per cent; null when there is nothing to hold it against. */
export function trendOf(now: number, before: number): { up: boolean; words: string } | null {
  if (before <= 0 && now <= 0) return null;
  if (before <= 0) return { up: true, words: 'none in the 30 days before' };
  const pct = Math.round(((now - before) / before) * 100);
  if (pct === 0) return null;
  return { up: pct > 0, words: `${pct > 0 ? 'up' : 'down'} ${Math.abs(pct)}% on the 30 days before` };
}

export function ItemSalesStrip({ itemId }: { itemId: number }) {
  const [brief, setBrief] = useState<ItemBrief | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    setBrief(null);
    setFailed(false);
    fetchItemBrief(itemId).then((b) => { if (live) setBrief(b); }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [itemId]);

  // A figure that did not load is left out: the form under it works without.
  if (failed) return null;
  if (!brief) return <div className="iss iss--wait" data-testid="item-sales-strip" aria-busy="true">Loading sales…</div>;

  const never = brief.all_time.qty <= 0;
  const trend = trendOf(brief.recent.qty, brief.before.qty);
  const link = `/reports?${new URLSearchParams({ tab: 'Items Sold', from: brief.from, to: brief.to, item: String(brief.item_id) }).toString()}`;
  const extras = brief.reviews.count > 0 || brief.questions_waiting > 0 || brief.alerts_waiting > 0;

  return (
    <div className="iss" data-testid="item-sales-strip">
      {never ? (
        <p className="iss-none" data-testid="item-sales-never">Not sold yet.</p>
      ) : (
        <>
          <div className="iss-tiles">
            <div className="iss-tile" data-testid="item-sales-recent">
              <span className="iss-label">Sold, last {brief.days} days</span>
              <strong className="iss-value">{num(brief.recent.qty)}</strong>
              <span className="iss-sub">{money(brief.recent.sales)}</span>
            </div>
            <div className="iss-tile" data-testid="item-sales-all">
              <span className="iss-label">Sold, all time</span>
              <strong className="iss-value">{num(brief.all_time.qty)}</strong>
              <span className="iss-sub">{money(brief.all_time.sales)}</span>
            </div>
            <div className="iss-tile" data-testid="item-sales-last">
              <span className="iss-label">Last sold</span>
              <strong className="iss-value iss-value--words">{brief.last_sold ? agoWords(brief.last_sold, brief.today) : 'Never'}</strong>
              <span className="iss-sub">{num(brief.recent.orders)} {brief.recent.orders === 1 ? 'order' : 'orders'} in {brief.days} days</span>
            </div>
          </div>
          {trend && (
            <p className={`iss-trend ${trend.up ? 'is-up' : 'is-down'}`} data-testid="item-sales-trend">
              <InlineIcon icon={trend.up ? TrendingUp : TrendingDown} />
              {trend.up ? 'Selling more: ' : 'Selling less: '}{trend.words}.
            </p>
          )}
          {brief.sizes.length > 0 && (
            <div className="iss-sizes" data-testid="item-sales-sizes">
              {brief.sizes.map((s) => (
                <span key={s.key} className="iss-size">
                  <b>{s.label}</b> {num(s.qty)} <span className="iss-size-all">({num(s.all_qty)} all time)</span>
                </span>
              ))}
            </div>
          )}
        </>
      )}
      {extras && (
        <div className="iss-extras" data-testid="item-sales-extras">
          {brief.reviews.count > 0 && (
            <span><InlineIcon icon={Star} />{brief.reviews.rating ?? '–'} from {brief.reviews.count} {brief.reviews.count === 1 ? 'review' : 'reviews'}</span>
          )}
          {brief.questions_waiting > 0 && (
            <Link to="/customers/questions"><InlineIcon icon={MessageCircleQuestion} />{brief.questions_waiting} {brief.questions_waiting === 1 ? 'question' : 'questions'} to answer</Link>
          )}
          {brief.alerts_waiting > 0 && (
            <span><InlineIcon icon={BellRing} />{brief.alerts_waiting} waiting to hear it is back</span>
          )}
        </div>
      )}
      {!never && <Link className="iss-more" to={link} data-testid="item-sales-more">See full sales</Link>}
    </div>
  );
}
