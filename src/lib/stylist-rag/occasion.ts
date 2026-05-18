export type OccasionContext = {
  hasWork: boolean;
  hasDate: boolean;
  hasFormal: boolean;
  hasCasual: boolean;
  hasGym: boolean;
  hasTravel: boolean;
  isCold: boolean;
  isHot: boolean;
  isRaining: boolean;
  labels: string[];
};

export function detectOccasion(
  text: string,
  temp: number,
  condition: string
): OccasionContext {
  const lower = text.toLowerCase();
  const cond = condition.toLowerCase();

  const hasWork = /\b(work|office|meeting|interview|presentation|client|professional)\b/.test(lower);
  const hasDate = /\b(date|dinner|drinks|romantic|anniversary)\b/.test(lower);
  const hasFormal = /\b(formal|wedding|gala|black tie|ceremony)\b/.test(lower);
  const hasCasual = /\b(casual|weekend|errands|brunch|coffee|hangout)\b/.test(lower);
  const hasGym = /\b(gym|workout|run|yoga|training|sport)\b/.test(lower);
  const hasTravel = /\b(travel|trip|flight|airport|vacation|holiday)\b/.test(lower);
  const isCold = temp < 14 || /\b(cold|chilly|layer|warm|winter)\b/.test(lower);
  const isHot = temp > 26 || /\b(hot|heat|summer|breathable)\b/.test(lower);
  const isRaining = cond.includes('rain') || /\b(rain|wet|waterproof)\b/.test(lower);

  const labels: string[] = [];
  if (hasWork) labels.push('work');
  if (hasDate) labels.push('date night');
  if (hasFormal) labels.push('formal');
  if (hasCasual) labels.push('casual');
  if (hasGym) labels.push('active');
  if (hasTravel) labels.push('travel');
  if (isCold) labels.push('cold weather');
  if (isHot) labels.push('warm weather');
  if (isRaining) labels.push('rain');

  return {
    hasWork,
    hasDate,
    hasFormal,
    hasCasual,
    hasGym,
    hasTravel,
    isCold,
    isHot,
    isRaining,
    labels,
  };
}
