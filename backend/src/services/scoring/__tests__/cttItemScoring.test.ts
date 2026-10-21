import { describe, expect, it } from 'vitest';
import {
  computeTScore,
  isMissingWithinThreshold,
  meanScore,
  scoreItem,
  ScoringError,
} from '../cttItemScoring.js';

// ---------------------------------------------------------------------------
// scoreItem
// ---------------------------------------------------------------------------

describe('scoreItem', () => {
  it('scores a direct item (positive direction) correctly', () => {
    // scale 1–5, value=3 → ((3-1)/(5-1))*100 = 50
    expect(scoreItem(3, 1, 5, 'positive')).toBeCloseTo(50);
  });

  it('scores a direct item with null direction as direct', () => {
    expect(scoreItem(3, 1, 5, null)).toBeCloseTo(50);
  });

  it('scores a reverse item (negative direction) correctly', () => {
    // scale 1–5, value=3 → direct=50, reverse=50
    expect(scoreItem(3, 1, 5, 'negative')).toBeCloseTo(50);
    // scale 1–5, value=1 → direct=0, reverse=100
    expect(scoreItem(1, 1, 5, 'negative')).toBeCloseTo(100);
    // scale 1–5, value=5 → direct=100, reverse=0
    expect(scoreItem(5, 1, 5, 'negative')).toBeCloseTo(0);
  });

  it('handles min different from 1 (general formula)', () => {
    // scale 0–10, value=5 → ((5-0)/(10-0))*100 = 50
    expect(scoreItem(5, 0, 10, 'positive')).toBeCloseTo(50);
    // scale 2–8, value=8 → ((8-2)/(8-2))*100 = 100
    expect(scoreItem(8, 2, 8, 'positive')).toBeCloseTo(100);
  });

  it('scores minimum value as 0 (direct)', () => {
    expect(scoreItem(1, 1, 4, 'positive')).toBeCloseTo(0);
  });

  it('scores maximum value as 100 (direct)', () => {
    expect(scoreItem(4, 1, 4, 'positive')).toBeCloseTo(100);
  });

  it('throws ScoringError when range is 0', () => {
    expect(() => scoreItem(3, 3, 3, 'positive')).toThrow(ScoringError);
  });
});

// ---------------------------------------------------------------------------
// isMissingWithinThreshold
// ---------------------------------------------------------------------------

describe('isMissingWithinThreshold', () => {
  it('allows 0 missing items', () => {
    expect(isMissingWithinThreshold(0, 10)).toBe(true);
  });

  it('allows exactly floor(n/2) missing items (even total)', () => {
    // floor(10/2) = 5 → 5 missing allowed
    expect(isMissingWithinThreshold(5, 10)).toBe(true);
  });

  it('rejects floor(n/2)+1 missing items (even total)', () => {
    expect(isMissingWithinThreshold(6, 10)).toBe(false);
  });

  it('handles odd totals: floor(5/2) = 2 → 2 missing allowed', () => {
    expect(isMissingWithinThreshold(2, 5)).toBe(true);
    expect(isMissingWithinThreshold(3, 5)).toBe(false);
  });

  it('handles 1-item scale: 0 missing allowed, 1 not', () => {
    expect(isMissingWithinThreshold(0, 1)).toBe(true);
    expect(isMissingWithinThreshold(1, 1)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// meanScore
// ---------------------------------------------------------------------------

describe('meanScore', () => {
  it('computes the mean of item scores', () => {
    expect(meanScore([0, 50, 100])).toBeCloseTo(50);
  });

  it('returns null for empty arrays', () => {
    expect(meanScore([])).toBeNull();
  });

  it('returns the single value for a one-item array', () => {
    expect(meanScore([75])).toBeCloseTo(75);
  });
});

// ---------------------------------------------------------------------------
// computeTScore
// ---------------------------------------------------------------------------

describe('computeTScore', () => {
  it('computes T-score correctly for a known scale', () => {
    // PS_S (S_Physical Symptoms): average=41.16635, sd=31.53132
    // T = 50 + 10 * ((50 - 41.16635) / 31.53132)
    const expected = 50 + 10 * ((50 - 41.16635) / 31.53132);
    expect(computeTScore(50, 'PS_S')).toBeCloseTo(expected, 4);
  });

  it('returns 50 when scaleScore equals the norm average', () => {
    // T = 50 + 10 * 0 = 50
    expect(computeTScore(41.16635, 'PS_S')).toBeCloseTo(50, 4);
  });

  it('returns null for a scale not in the norms dictionary', () => {
    expect(computeTScore(50, 'UNKNOWN_XYZ')).toBeNull();
  });

  it('returns null for empty scale name', () => {
    expect(computeTScore(50, '')).toBeNull();
  });
});
