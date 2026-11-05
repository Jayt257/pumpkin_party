// Flow of one match or solo level: rounds, countdowns, results and rewards.
import { RoundView } from './roundview.js';
import { LEVELS, LEVEL_ORDER, matchPlan } from '../levels/index.js';
import { botSkill, buildRoster, difficulty, makePacing } from './director.js';

const COUNT_TIME = 3;

export class Match {
  /** @param {object} o { solo: levelId | null, quick: skip the intro flyover } */
  constructor(app, o = {}) {
    this.app = app;
    this.solo = o.solo || null;
    this.quick = !!o.quick;
    const p = app.profile;
    const st = p.d.stats;
    this.diff = difficulty(st);
    let s = (Date.now() & 0xffffff) | 1;
    this.rand = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
    this.plan = this.solo
      // Solo survival plays out to the last rival, because stars reward how long you outlast them.
      ? [{ level: this.solo, players: LEVELS[this.solo].playersDefault, quota: LEVELS[this.solo].mode === 'race' ? LEVELS[this.solo].quotaDefault : 1 }]
      : matchPlan(st.matches, this.rand);
    this.roster = buildRoster(16, this.diff, this.rand);
    this.roundIndex = 0;
    this.totals = { coins: 0, xp: 0, gems: 0, event: 0, qualified: 0 };
    this.phase = 'none';
    this.t = 0;
    this.lastCount = -1;
    this.playerOut = false;
    this.playerIn = false;
    this.view = null;
    this.endScheduled = false;
    this.stateTimer = 0;
    this.warned = false;
  }

  get hud() { return this.app.hud; }

  begin() { this.startRound(0); }

  /** Who plays this round: the player plus whichever rivals are still alive in the match. */
  entrants(n) {
    const eq = this.app.profile.d.equip;
    const out = [{ isPlayer: true, name: this.app.profile.displayName, skin: eq.skin, hat: eq.hat, glasses: eq.glasses, trail: eq.trail }];
    for (let i = 0; i < n - 1 && i < this.roster.length; i++) {
      const b = this.roster[i];
      out.push({ ...b, skill: botSkill(this.diff, this.roundIndex, this.rand) });
    }
    // Spawn the player mid-pack so they start with rivals around them.
    const slot = Math.min(out.length - 1, Math.floor(out.length * (0.55 + this.rand() * 0.3)));
    const pl = out.shift();
    out.splice(slot, 0, pl);
    return out;
  }

  startRound(i) {
    const app = this.app;
    this.roundIndex = i;
    this.disposeView();
    document.body.dataset.screen = 'round';
    const R = this.plan[i];
    const def = LEVELS[R.level];
    const racers = this.entrants(R.players);
    this.players = racers.length;
    this.quota = Math.min(R.quota, racers.length);
    const seed = 1 + Math.floor(this.rand() * 90000);
    this.view = new RoundView(app, def, {
      seed, racers, quota: this.quota,
      difficulty: this.diff,
      pacing: makePacing(this.diff, () => this.view?.sim.player),
      onEvent: (e) => this.onEvent(e),
      intro: this.quick ? 0 : 3.2,
    });
    if (this.quick) { this.view.intro = null; }
    app.setActiveView(this.view);
    this.def = def;
    this.playerOut = false; this.playerIn = false; this.endScheduled = false; this.warned = false;
    this.hud.mount({
      round: i + 1, total: this.plan.length, objective: def.mode === 'race' ? `${this.view.level.objective}` : this.view.level.objective, mode: def.mode,
      levelName: def.name, totalPlayers: racers.length, solo: !!this.solo,
    });
    this.lastCount = -1;
    this.lastEmoteT = 0;
    const music = R.level === 'finalShowdown' ? 'final' : 'race';
    app.audio.music(music);
    if (this.view.intro) {
      this.phase = 'intro';
      this.hud.introCard({
        round: i + 1, total: this.plan.length, name: def.name, objective: def.mode === 'race' ? `Top ${this.quota} qualify!` : def.mode === 'last' ? 'Last one standing wins the crown!' : `Top ${this.quota} survive!`, hint: def.hint, solo: !!this.solo,
      });
      app.audio.sfx('whoosh', 0.6);
      const skip = () => { this.view?.skipIntro(); };
      window.addEventListener('keydown', skip, { once: true });
      window.addEventListener('pointerdown', skip, { once: true });
      this.removeSkip = () => { window.removeEventListener('keydown', skip); window.removeEventListener('pointerdown', skip); };
    } else this.toCountdown();
    const showTips = !app.profile.d.flags.tutorial;
    if (showTips && i === 0) this.hud.showTips();
    app.input.setEnabled(true);
    app.input.pointerLockWanted = !app.isTouch;
  }

  toCountdown() {
    this.removeSkip?.();
    this.phase = 'count';
    this.t = 0;
    this.lastCount = -1;
    this.hud.clearMessage();
  }

  update(dt) {
    const v = this.view;
    if (!v) return;
    switch (this.phase) {
      case 'intro':
        this.app.input.clearPresses();
        break;
      case 'count': {
        this.t += dt;
        const left = COUNT_TIME - this.t;
        const n = Math.ceil(left);
        if (n !== this.lastCount && n > 0) {
          this.lastCount = n;
          this.hud.message(String(n), 'count', 900);
          this.app.audio.sfx('count');
        }
        if (left <= 0) {
          v.sim.go();
          this.phase = 'play';
          this.hud.message('GO!', 'go', 800);
          this.app.audio.sfx('go');
          this.app.sdk.gameplayStart();
          this.playStart = performance.now();
        }
        break;
      }
      case 'play': this.updatePlay(dt); break;
      case 'post':
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) this.finishRound();
        break;
      default:
    }
  }

  updatePlay(dt) {
    const v = this.view, sim = v.sim, L = v.level, p = sim.player;
    const input = this.app.input;
    // Onboarding marks.
    if (this.hud.tips) {
      if (Math.hypot(input.moveX, input.moveY) > 0.3) this.hud.tipDone('move');
      if (p.airTime > 0.1 && !p.grounded) this.hud.tipDone('jump');
      if (p.state === 1) this.hud.tipDone('dive');
      if (v.cam.lookIdle < 0.2) this.hud.tipDone('look');
    }
    // Timer and counters.
    const limit = L.timeLimit || 120;
    const remain = limit - sim.elapsed;
    if (L.mode === 'race') {
      this.hud.setClock(remain, remain < 15);
      this.hud.setQualified(sim.qualified.length);
      if (!p.finished) this.hud.setRank(sim.rankOf(p));
      else this.hud.setRank(p.place);
    } else {
      this.hud.setClock(remain, remain < 10);
      const alive = sim.racers.filter((r) => !r.eliminated).length;
      this.hud.setQualified(alive);
      this.hud.setRank(0);
    }
    // Chaser warning.
    if (L.chaser && L.chaser.active && p.active && !p.finished) {
      const gap = L.chaser.gap(p);
      this.hud.setWarn(gap < 16 ? `${gap < 8 ? 'BOO! ' : ''}Ghost ${Math.max(0, Math.round(gap))}m behind!` : '');
    } else this.hud.setWarn('');
    // Warn near the end of the clock.
    if (remain < 10 && !this.warned) { this.warned = true; this.app.audio.sfx('count', 0.6); }

    // Once the player's safe, wrap up the round promptly: nobody likes to wait.
    if (this.playerIn && !sim.ended && L.mode === 'race') {
      this.wrapT = (this.wrapT ?? 3.2) - dt;
      if (this.wrapT <= 0) {
        const pending = sim.racers.filter((r) => !r.finished && !r.eliminated && r.active).sort((a, b) => L.progress(b) - L.progress(a));
        const need = Math.max(0, this.quota - sim.qualified.length);
        pending.slice(0, need).forEach((r) => sim.qualify(r));
        sim.endRound();
      }
    }
    // Spectating after a knockout isn't needed in single-player, so results come quickly.
    if (this.playerOut && !this.endScheduled) { this.endScheduled = true; this.phase = 'post'; this.stateTimer = 1.9; }
  }

  onEvent(e) {
    const app = this.app, sim = this.view?.sim;
    const profile = app.profile;
    switch (e.type) {
      case 'introEnd':
        this.toCountdown();
        break;
      case 'qualify':
        if (e.racer.isPlayer) {
          this.playerIn = true;
          this.wrapT = 3.2;
          this.place = e.racer.place;
          this.hud.message(this.def.mode === 'last' ? 'Champion!' : 'Qualified!', 'gold', 1900);
          this.hud.setWarn('');
          app.input.exitLock();
        }
        break;
      case 'eliminate':
        if (e.racer.isPlayer) {
          this.playerOut = true;
          this.hud.message(e.racer.outReason === 'caught' ? 'BOO! Caught!' : 'Eliminated!', 'red', 1900);
          this.hud.setWarn('');
          app.audio.sfx(e.racer.outReason === 'caught' ? 'boo' : 'lose');
          app.input.exitLock();
          profile.d.stats.falls++;
        } else if (sim && !this.playerOut && sim.level.mode !== 'race') {
          app.audio.sfx('ping', 0.3, 0.8);
        }
        break;
      case 'playerFell':
        profile.d.stats.falls++;
        break;
      case 'playerHit':
        profile.d.stats.hits++;
        break;
      case 'playerJump':
        profile.d.stats.jumps++;
        profile.track('jump');
        break;
      case 'playerDive':
        profile.d.stats.dives++;
        profile.track('dive');
        break;
      case 'playerBounce':
        profile.track('bounce');
        break;
      case 'roundEnd':
        if (this.phase === 'play' && !this.endScheduled) {
          this.endScheduled = true;
          this.phase = 'post';
          this.stateTimer = this.playerIn ? 2.2 : 1.9;
          // The player was running when spots filled up.
          if (sim.player.eliminated && !this.playerOut) {
            this.playerOut = true;
            this.hud.message('Eliminated!', 'red', 1900);
            app.audio.sfx('lose');
            app.input.exitLock();
          }
        }
        break;
      default:
    }
  }

  /** Round rewards. Small numbers per round add up to about one skin every three matches. */
  roundRewards(placedIn) {
    const base = 14 + this.roundIndex * 7;
    const place = Math.max(0, 12 - (placedIn - 1) * 2);
    const coins = base + place;
    const xp = 20 + this.roundIndex * 6;
    return { coins, xp };
  }

  finishRound() {
    const app = this.app, sim = this.view.sim, p = sim.player, profile = app.profile;
    app.sdk.gameplayStop();
    app.input.setEnabled(false);
    this.hud.unmount();
    profile.d.stats.rounds++;
    const time = p.finished ? p.finishTime : sim.elapsed;

    if (this.solo) return this.finishSolo(p, sim, time);

    if (p.finished) {
      const place = p.place || 1;
      const r = this.roundRewards(place);
      this.totals.coins += r.coins; this.totals.xp += r.xp; this.totals.qualified++;
      this.totals.event += 6 + this.roundIndex * 2;
      profile.d.stats.qualified++;
      profile.track('qualify');
      profile.track('earned', r.coins);
      if (this.def.mode === 'race' && place <= 3) profile.track('podium');
      if (this.def.mode !== 'race') profile.track('survive');
      if (this.plan[this.roundIndex + 1]?.level === 'finalShowdown') { profile.track('final'); profile.d.stats.finals++; }

      if (this.roundIndex >= this.plan.length - 1) return this.endMatch(true);

      // The survivors carry over: remove those who got knocked out from the roster.
      const out = sim.racers.filter((x) => !x.finished && !x.isPlayer).map((x) => x.def.name);
      this.roster = this.roster.filter((b) => !out.includes(b.name));
      this.rand(); // advance so the next round's seed differs
      const stars = place <= 3 ? 3 : place <= Math.ceil(this.quota * 0.6) ? 2 : 1;
      app.menuBackdrop('complete');
      app.audio.music('menu');
      app.audio.sfx('win', 0.7);
      app.menu.celebrate();
      const players = sim.racers.length, qualified = sim.qualified.length;
      this.disposeView();
      app.ui.roundComplete({
        round: this.roundIndex + 1, total: this.plan.length, stars, qualified, players, time, rewards: r,
        onNext: () => { app.ui.clear(); app.setActiveView(null); this.startRound(this.roundIndex + 1); },
        onMenu: () => { this.endMatch(false, true); },
      });
      return undefined;
    }
    // Knocked out. One second chance per session, if ads are available.
    if (this.roundIndex < this.plan.length - 1 && app.sdk.canOfferRewarded && !app.session.reviveUsed && !this.reviveOffered) {
      this.reviveOffered = true;
      app.menuBackdrop('lose');
      this.disposeView();
      app.ui.revive({
        onAccept: async () => {
          app.ui.clear();
          app.session.reviveUsed = true;
          const ok = await app.rewardedAd();
          if (ok) {
            this.toastNext = true;
            app.setActiveView(null);
            this.startRound(this.roundIndex + 1);
          } else {
            app.ui.toast('No video is available right now.');
            this.endMatch(false);
          }
        },
        onDecline: () => this.endMatch(false),
      });
      return undefined;
    }
    return this.endMatch(false);
  }

  async endMatch(crown, quit = false) {
    const app = this.app, profile = app.profile;
    this.disposeView();
    this.hud.unmount();
    app.input.setEnabled(false);
    const reached = this.roundIndex + 1;
    const total = this.plan.length;
    const t = this.totals;
    // Completion bonus scales with progress.
    t.coins += 10 + reached * 6 + (crown ? 110 : 0);
    t.xp += 20 + reached * 10 + (crown ? 80 : 0);
    t.event += 4 + reached * 3 + (crown ? 30 : 0);
    if (crown) t.gems += 3;
    profile.d.coins += t.coins;
    profile.d.gems += t.gems;
    profile.addEventPoints(t.event);
    const ups = profile.addXP(t.xp);
    profile.recordMatch(reached, crown);
    profile.track('match');
    profile.d.flags.firstMatch = true;
    profile.d.flags.tutorial = true;
    if (crown) { profile.track('crown'); app.sdk.happytime(); }
    const totalProgress = Math.min(100, (profile.totalStars() / 18) * 80 + Math.min(profile.d.stats.crowns, 4) * 5);
    app.sdk.reportCompletion(totalProgress);
    profile.save(true);
    if (quit) { app.showMenu(); return; }

    app.menuBackdrop(crown ? 'champion' : 'lose');
    // Natural break between matches: the SDK itself decides whether an ad is due.
    if (app.session.playedSeconds() > 180) await app.midgameAd();
    app.audio.music('menu');
    if (crown) { app.audio.sfx('win'); app.menu.celebrate(); }
    const place = crown ? 1 : Math.max(2, (this.plan[this.roundIndex]?.quota ?? 2) + 1);
    app.ui.results({
      crown, reached, totalRounds: total, place, rewards: t, levelUps: ups,
      canDouble: app.sdk.canOfferRewarded,
      onDouble: async () => {
        const ok = await app.rewardedAd();
        if (ok) { profile.addCoins(t.coins); }
        return ok;
      },
      onAgain: () => app.startMatch({ skipLobby: true }),
      onMenu: () => app.showMenu(),
    });
  }

  finishSolo(p, sim, time) {
    const app = this.app, profile = app.profile, def = this.def;
    let stars = 0;
    if (def.mode === 'race') {
      if (p.finished) { stars = 1; if (time <= def.stars[0]) stars = 2; if (time <= def.stars[1]) stars = 3; }
    } else {
      // Placement among the field: outlast half for one star, reach the top three for two, last standing for three.
      const n = sim.racers.length;
      const place = p.finished ? sim.qualified.length : n - sim.eliminated.indexOf(p);
      stars = place <= 1 ? 3 : place <= 3 ? 2 : place <= Math.ceil(n / 2) ? 1 : 0;
    }
    profile.setStars(def.id, stars);
    const rewards = { coins: stars ? 8 + stars * 7 : 4, xp: 10 + stars * 8, event: 2 + stars * 2, gems: 0 };
    profile.d.coins += rewards.coins;
    profile.addEventPoints(rewards.event);
    const ups = profile.addXP(rewards.xp);
    if (p.finished) { profile.track('qualify'); profile.track('earned', rewards.coins); }
    if (def.mode !== 'race' && p.finished) profile.track('survive');
    profile.d.flags.tutorial = true;
    profile.save(true);
    this.disposeView();
    app.menuBackdrop(stars ? 'complete' : 'lose');
    app.audio.music('menu');
    if (stars) { app.audio.sfx('win', 0.7); app.menu.celebrate(); }
    const idx = LEVEL_ORDER.indexOf(def.id);
    const nxt = LEVEL_ORDER[idx + 1];
    const canNext = nxt && !(LEVELS[nxt].lockedUntilStars && profile.totalStars() < LEVELS[nxt].lockedUntilStars);
    app.ui.results({
      crown: false, reached: 1, totalRounds: 1, place: 1, rewards, levelUps: ups, soloStars: stars,
      canDouble: false, onDouble: async () => false,
      onAgain: () => app.startSolo(def.id),
      onMenu: () => app.goto('levels'),
      nextLevel: canNext ? () => app.startSolo(nxt) : null,
    });
  }

  disposeView() {
    if (this.view) {
      this.app.setActiveView(null);
      this.view.dispose();
      this.view = null;
    }
  }
}
