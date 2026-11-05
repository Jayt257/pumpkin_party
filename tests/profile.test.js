import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map();
vi.stubGlobal('localStorage', { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) });

const { Profile, EVENT_TRACK, DAILY_REWARDS } = await import('../src/core/profile.js');
const { difficulty, botSkill } = await import('../src/game/director.js');

describe('profile and economy', () => {
  let p;
  beforeEach(() => { store.clear(); p = new Profile().load(); });

  it('starts with a pumpkin and enough for a head start', () => {
    expect(p.d.equip.skin).toBe('pumpkin');
    expect(p.owns('skin', 'pumpkin')).toBe(true);
    expect(p.owns('skin', 'ghost')).toBe(false);
    expect(p.d.coins).toBeGreaterThan(0);
  });

  it('buys items only with enough coins, and never event exclusives', () => {
    p.d.coins = 100;
    expect(p.buy('skin', 'ghost')).toBe(false);
    p.d.coins = 500;
    expect(p.buy('skin', 'ghost')).toBe(true);
    expect(p.d.coins).toBe(200);
    expect(p.owns('skin', 'ghost')).toBe(true);
    p.d.coins = 99999;
    expect(p.buy('skin', 'goldking')).toBe(false);
  });

  it('levels up and pays a reward', () => {
    const coins = p.d.coins;
    expect(p.addXP(p.xpFor(1))).toBe(1);
    expect(p.d.level).toBe(2);
    expect(p.d.coins).toBeGreaterThan(coins);
  });

  it('daily missions progress, complete and pay out once', () => {
    const m = p.missions()[0];
    expect(p.claimMission(m.id)).toBe(null);
    p.track(m.stat, m.need);
    const c = p.d.coins;
    expect(p.claimMission(m.id)).toBeTruthy();
    expect(p.d.coins).toBeGreaterThanOrEqual(c);
    expect(p.claimMission(m.id)).toBe(null);
  });

  it('daily reward can be claimed once a day', () => {
    expect(p.dailyAvailable()).toBe(true);
    const r = p.claimDaily();
    expect(r).toEqual(DAILY_REWARDS[0]);
    expect(p.dailyAvailable()).toBe(false);
    expect(p.claimDaily()).toBe(null);
  });

  it('event track unlocks in order with candy, and the top reward is exclusive', () => {
    expect(p.eventTierReady(0)).toBe(false);
    p.addEventPoints(EVENT_TRACK[0].need);
    expect(p.eventTierReady(0)).toBe(true);
    expect(p.claimEvent(0)).toBeTruthy();
    expect(p.claimEvent(0)).toBe(null);
    expect(EVENT_TRACK[EVENT_TRACK.length - 1].reward.item).toEqual(['skin', 'goldking']);
  });

  it('saves and reloads progress through storage', () => {
    p.d.coins = 4242;
    p.save(true);
    const q = new Profile().load();
    expect(q.d.coins).toBe(4242);
    expect(q.d.owned.skin).toContain('pumpkin');
  });

  it('a corrupt save falls back to defaults instead of crashing', () => {
    store.set('pumpkinparty.save', '{not json');
    expect(new Profile().load().d.level).toBe(1);
  });
});

describe('difficulty director', () => {
  it('goes easy on a new player and tightens with experience', () => {
    const fresh = difficulty({ matches: 0, recent: [], streak: 0 });
    const vet = difficulty({ matches: 30, recent: [5, 4, 5, 3, 4], streak: 3 });
    expect(fresh).toBeLessThan(0.2);
    expect(vet).toBeGreaterThan(0.75);
  });

  it('eases off after repeated early knockouts', () => {
    const a = difficulty({ matches: 10, recent: [3, 3, 3], streak: 0 });
    const b = difficulty({ matches: 10, recent: [1, 1, 1], streak: 0 });
    expect(b).toBeLessThan(a);
  });

  it('bot skill stays in range', () => {
    for (let i = 0; i < 100; i++) {
      const s = botSkill(Math.random(), i % 5, Math.random);
      expect(s).toBeGreaterThanOrEqual(0.08);
      expect(s).toBeLessThanOrEqual(0.98);
    }
  });
});
