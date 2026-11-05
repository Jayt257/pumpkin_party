# Research: party-platformer design, retention and CrazyGames rules (2026-11-04)

Done before implementation. Each finding is followed by what it changed in this game.

## CrazyGames: what the platform measures and requires

Basic Launch runs for at least 7 days and 500 plays (or ends after 21 days). The KPIs judged are average play time (successful titles often see 10+ minutes), day-1 retention (strong games 10-15%) and conversion, meaning the share who play at least one minute. Top performers reach 80%+ conversion, with load times under 10 seconds and a build below 20 MB. ([Basic Launch metrics][metrics])

**Decisions**
- Everything is generated at runtime, so the build is about 1.2 MB and loads in seconds. That protects conversion, the KPI most sensitive to load time.
- A match is designed to last long enough on its own to reach the 10-minute average: five rounds of 30-70 seconds with a quick re-queue.
- New players start in gameplay with no menu in the way, as Full Launch requires ([gameplay rules][gameplay]).

The full rule-by-rule status is in `crazygames-compliance.md`.

## Level design

What the developers of the genre's best-known game say about their own rounds:

- Rounds should be "simple, replayable", and the target is that players feel a failure was their own fault. If a level feels unavoidable, it has gone too far. ([Game Developer Q&A][gd])
- Uneven difficulty between stages creates memorable spikes. Making every round that hard would be exhausting. ([Game Developer Q&A][gd])
- Build rounds by finding new combinations of a small obstacle suite, favouring obstacles that create stories. ([Game Developer Q&A][gd])
- Test how far a character can jump and dive before designing; raise difficulty as players progress; theme sections so players can tell they've entered a harder zone; use narrow spaces to make players bump into props. ([Epic: designing an obstacle course][epic])
- Secondary reporting attributes a split of about 80% skill to 20% chaos to the team. I could not open the primary article to confirm the wording, so it's used here as a rule of thumb only.

Obstacle-course guidance from the Roblox "obby" community agrees: start easy, ramp steadily, offer breathers, keep hitboxes fair, and treat checkpoints as what stops difficulty becoming frustration. One rule of thumb is a checkpoint every 3-5 obstacles on an easy course. These are blog and glossary sources, so they're starting points. ([creation.dev design guide][obby])

**Decisions**
- Hitboxes are smaller than the art: the hammer capsule is 82% of the barrel's radius.
- Pumpkin Dash runs teach → test → breather → twist: hammers with escape lanes, optional hops beside a safe plank, spin bars, bounce pads, then faster hammers.
- A checkpoint sits after every one or two obstacles in early rounds, and side walls turn most knocks into lost time rather than a long fall.
- A knock is followed by brief immunity, so nobody is stun-locked.
- Six levels are built from a small suite of obstacle types (hammer, bar, disc, ghost, pad, boulder, tile, pillar), so new maps are cheap to add later.

## Movement feel

Coyote time is commonly 0.1-0.2 s, and one forum example buffers jumps by 0.3 s with 0.125 s of coyote time ([Godot recipe][coyote], [Roblox forum][roblox]). Heavier fall gravity reduces floatiness, adjustable jump height rewards tapping, and jump values should be derived from a target height and time ([game-feel notes][feel]). Squash and stretch on jumps, landings and impacts sells the motion ([game-feel notes][feel]). I found no published numbers for run speed, jump height or stun time in commercial party games, so all values here were tuned against this game's own course dimensions and verified in tests.

**Decisions** (`src/physics/racer.js`, values in `MOVE`)
- Coyote 0.11 s, jump buffer 0.13 s, fall gravity 1.22×, tap-to-short-hop, momentum kept in the air.
- Dive as a commitment: it adds reach but costs a slide and a get-up.
- An automatic ledge pull-up, so near misses become saves. This matters most on touch, where there's no room for a separate grab button.
- Physics runs at a fixed 120 Hz with render interpolation, as CrazyGames requires consistent behaviour at 144 and 165 Hz ([gameplay rules][gameplay]).

## Retention

- "If a player can feel accomplished in three minutes, they're more likely to come back tomorrow", with short replayable sessions, clear progress indicators and quick loading. This is one design blog's opinion. ([Pixelfield][pixel])
- An interview study of Battle Royale players found new content, reward systems and social dynamics among its seven retention themes. ([Press Start][pressstart])
- Research on matchmaking found that standard skill-based matching means many players lose as often as they win, and that matching should account for how each match shapes what the player does next. An analysis of bot use found an optimal policy could improve engagement by 4-6%, but that work studied competitive games like chess, not party games. ([INFORMS][informs])
- Customisation deepens attachment; daily quests and streaks give short sessions a goal. ([Certainly][certainly], [Argentics][argentics])
- I found no data on Stumble Guys or similar games' bot policies, and vendor claims about bots raising retention by 50% are sales copy, so they're not relied on.

**Decisions** (`src/game/director.js`, `src/core/profile.js`)
- The director goes easy on newcomers: bot skill and rubber-banding fade as matches accumulate, and ease off after repeated early knockouts.
- Within three minutes a first-time player has run a round, qualified, earned coins and usually levelled up.
- Goals on three time scales: this match (crown), today (three missions, login reward), this fortnight (Halloween Event track with an exclusive skin).
- A quick return loop: Play Again is one click, and a finished player doesn't wait for the rest of the field.

## Ads, for Full Launch

Rules: never during gameplay, never on a navigation button, no chained ads, mute only when the ad starts, and no reward on `adError`. The decline button must match accept in size, font and colour. ([ad rules][ads]) Pacing: request at every natural break and let the SDK limit frequency (about one per three minutes), and delay ads for the first 3-5 minutes of play. ([pacing][pacing]) For action games: one revive per session with a 5-second countdown, and loot multipliers after a round. ([action guide][action]) Name the exact reward on the button with a video icon, and keep rewards modest with daily caps. ([rewarded guide][rewarded])

**Decisions**
- Midgame ad only between matches, requested automatically after three minutes of play, never from a button.
- Rewarded: double coins on results, one second chance per session, capped free coins. Banner only in the shop.
- All off for Basic Launch, where ads are disabled anyway.

## Sources

[metrics]: https://docs.crazygames.com/resources/basic-launch-metrics/
[gameplay]: https://docs.crazygames.com/requirements/gameplay/
[ads]: https://docs.crazygames.com/requirements/ads/
[pacing]: https://docs.crazygames.com/resources/midgame-ads-pacing/
[action]: https://docs.crazygames.com/resources/monetizing-action/
[rewarded]: https://docs.crazygames.com/resources/rewarded-ads-deep-dive/
[gd]: https://www.gamedeveloper.com/design/q-a-designing-for-seasons-in-bumbling-platform-royale-i-fall-guys-i-
[epic]: https://dev.epicgames.com/documentation/fortnite/fall-guys-designing-an-obstacle-course-in-fortnite-creative
[obby]: https://www.creation.dev/blog/roblox-obby-design-guide
[coyote]: https://kidscancode.org/godot_recipes/4.x/2d/coyote_time/index.html
[roblox]: https://devforum.roblox.com/t/coyote-time-and-jump-buffer-for-platformer-games/2809273
[feel]: https://kindatechnical.com/game-development/input-buffering-coyote-time-and-game-feel.html
[pixel]: https://pixelfield.co.uk/blog/how-to-design-games-for-retention/
[pressstart]: https://press-start.gla.ac.uk/press-start/article/view/212
[informs]: https://www.informs.org/News-Room/INFORMS-Releases/News-Releases/Smarter-Matchmaking-Not-Just-Equal-Skill-Could-Keep-Millions-More-Gamers-Playing-Study-Finds
[certainly]: https://www.certainly.io/blog/designing-for-retention-lessons-from-the-most-addictive-online-games
[argentics]: https://www.argentics.io/game-mechanics-that-boost-player-retention
