# Pumpkin Party: release backlog (ideas only, nothing implemented)

Collected 2026-11-05. **[R]** means the idea is backed by a source below. **[O]** is an original proposal for this game, not proven anywhere. Effort: S = about a day, M = a few days, L = a week or more.

## Where the game stands

The technical base is sound: all 26 browser tests pass, the build is 1.2 MB, and it runs at 60 FPS on the integrated GPU at 720p and the dedicated GPU at 1080p. But passing tests shows it works, not that it's fun. Nobody has played it by hand yet, and the synthesised audio has never been listened to.

Why it reads as a base rather than a finished game:

| Gap | What's there today |
|---|---|
| Level-based structure | Level Select, stars and worlds are still in the main menu |
| Little variety | 6 maps and 3 rule sets (race, survive, last standing). Round 1 is usually Pumpkin Dash and the final is always the same |
| Few player actions | Run, jump, dive. Almost no way to affect rivals |
| Faceless rivals | Bots have names, but the game never shows them. Eliminations appear only as a counter changing |
| No ceremony | Rounds start with a title card. Rewards appear as static numbers, with no reveal or count-up |
| Stiff character reactions | Faces never change. Tumbling is a spin with flailing limbs, not real ragdoll physics |
| Dead economy pieces | Gems are earned but buy nothing. Hats and glasses aren't in the Shop. The event's rewards repeat every 14 days |
| Passive home screen | A menu column beside a posing character, with no "next goal" and nothing to do while waiting |
| Unused download budget | 1.2 MB used against a 20 MB mobile limit, so there's about 18 MB free for real music, voices and hand-made art |

## 1. Match flow (replaces level-based play)

Target flow: **Home → lobby → round reveal → round → standings → next reveal ... → champion → rewards → Play Again.**

1. **Remove Level Select, stars and worlds from the main path.** Keep a small Practice option for maps already seen. [O] S
2. **Random round playlist with rules:** no repeats in a match, at least one race and one non-race, one wildcard slot, a final drawn from a pool. Fall Guys draws its rounds by an unpublished algorithm, so the rules are ours to set. [R] M
3. **Ouija Board round reveal:** a planchette glides over a spirit board and lands on the next game, with sound and a preview of the hazard. This replaces the common slot-machine reveal. [O] M
4. **Trick or Treat choice** at some reveals: Treat plays the round as normal; Trick adds a curse for double candy. It gives players a choice inside a random match. [O] M
5. **Curses (round modifiers):** moon gravity, giant heads, fog with lantern light only, slippery slime, tiny bodies, double-speed hammers. A small number of curses multiplies every map. Avoid reversed controls, which feel unfair. [O] M
6. **Standings between rounds:** portraits of who's left, who just went out, and your place. [O] S
7. **Playable lobby:** run, emote and bump things during the wait. Stumble Guys added a matchmaking area where you "move, emote, and show off" while waiting. [R] M
8. **Short waits.** Stumble Guys reports about 15 seconds for matching and map selection. With AI rivals we can stay under 5. [R] S
9. **Bigger lobbies:** Stumble Guys uses up to 32 players over three rounds. Try 20-24 with faster rounds if performance allows. [R] M
10. **Round mix by stage:** openers forgiving, middle varied, final tense. Deliberately uneven difficulty creates memorable spikes, and making every round hard would be exhausting. [R] S

## 2. New original game types

| Type | Idea | Hook | Effort |
|---|---|---|---|
| Collect | **Trick or Treat Street:** ring doorbells along a street. Most give candy, some release a monster | Push-your-luck, very on theme | M |
| Survive | **Lantern Night:** the arena goes dark and only pools of lantern light are safe, shrinking like a battle royale zone | Shows off the lighting; PUBG-style pressure | M |
| Stealth | **Hide and Spook:** hide among pumpkin decoys while a ghost hunts, moving only when it looks away | Very funny, reuses existing assets | M |
| Timing | **Moonlight Freeze:** run when clouds cover the moon, freeze when it's out | Instantly understood | S |
| Rhythm | **Monster Mash:** hit dance moves on the beat or fall through the stage | Almost no party racer does this; uses emotes and music | M |
| Tag | **Witch's Curse:** bump someone to pass the curse; whoever holds it when the timer ends is out | Simple, and creates chases | M |
| Outbreak | **Zombie Night:** one zombie infects others; the last human wins | Tension rises on its own | M |
| Steal | **Candy Bandits:** dive into rivals to knock their candy loose; top haul survives | Gives players a way to affect each other | M |
| Race | **Broomstick Rush:** auto-flight through hoops, steering only | Fresh controls, easy on mobile | L |
| Final | **Pumpkin King's Throne:** hold the throne for a total of 20 seconds while everyone tries to knock you off | A clear, dramatic ending | M |
| Final | **Bounty Final:** the leader wears the crown and everyone can see them | Battle royale tension at the top | M |
| Any | **Haunted Gauntlet:** a race assembled at random from existing sections, different every match | Cheap, endless variety | M |

Replayability in Ultimate Chicken Horse comes from player-driven change, and from having two goals at once: finish, and catch rivals with your traps. A later idea is letting ghosts place one trap for the next round. [R] L

## 3. Keep it original

From my own knowledge of Fall Guys, not from a source, these are the closest matches today:

| Ours | Too close to | Change |
|---|---|---|
| Haunted Floor | Hex-A-Gone (floors that drop away across layers) | Rework around lantern light or graves that open |
| Final Showdown | Jump Showdown (spinning beams, falling pads) | Use the Throne or Bounty final; keep the cauldron setting |
| Hammer alley | Its swinging-obstacle races | Keep hammers, but add ghost and candy hazards |
| Dive, "Qualified", "Eliminated", the crown | Its signature verbs and words | Consider new actions and words: "Spared" and "Spooked", with candy in place of a crown |

Originality pillars [O]:
- **Eliminated doesn't mean finished** (see section 4).
- **Monster powers** rather than a clumsy everyman.
- **Candy score** across a match, not only survival.
- **A spooky show host** with a personality.

Reskinning a known game is also a practical risk: CrazyGames requires original content and warns against names and icons easily confused with other games. [R]

## 4. Battle royale drama (one winner)

Assumption: "first player" means being the single winner, with everyone else knocked out along the way.

1. **Haunt mode, the signature idea:** when you're knocked out you become a ghost, not a spectator. Spook a rival within 15 seconds to steal their place. Once per match, for bots too. Warzone's developers called its comeback "a nice, fair, second chance" for a bad knockout, and said buy-backs led to "lots of revenge fights, which are fun". They cite fairness and feel; I found no retention data. [R for the principle, O for the form] M
2. **Second place still feels good.** One write-up notes second place can feel disappointing even after beating 98 players. Show "You beat 14 rivals" and give a runner-up reward. [R] S
3. **Progress without winning: Crown Candy.** Every round fills a meter that converts to a crown, as Fall Guys did with Crown Shards, so a player who never wins still advances. [R] S
4. **Champion ceremony:** slow motion on the last elimination, a throne and a coronation. The winner's costume then appears in the castle on the home screen. [O] M
5. **Pressure events:** "3 spots left!", a music change, the arena closing in, a zoom on the final moments. Shrinking zones exist to force encounters. [R] M
6. **Catch-up without blatant cheating:** Mario Kart weights items by race position, so trailing racers get stronger ones. Runbow makes leader pickups double-edged. Use both for our power pickups. [R] M

## 5. Rivals with personality

Naavik flags the main risk of fake multiplayer: "bots can feel repetitive and unrealistic". [R]

1. **Personalities, each with a visible style:** Speedster, Bully (dives at you), Clown (fails funnily), Coward (hangs back), Showboat (emotes before the finish). [O] M
2. **Show names:** nameplates nearby and a feed: "Count Waffles got bonked!" [O] S
3. **A nemesis:** the rival who beat you returns, with "Rematch?" on the home screen. [O] M
4. **Stay honest:** keep the "AI rivals" label. It's also what CrazyGames' accuracy guidance asks for. [R] S

## 6. Difficulty and level design

1. **Protect against losing streaks.** Research models churn as driven by losing streaks, and a simulation on EA data found equal-skill matching isn't always best for engagement. Our director already eases off after repeated early knockouts, so make that stronger. This work is contested and comes from simulations and models, so use it lightly and never manipulatively. [R] S
2. **Build levels as teach, test, twist, final exam,** the four-step pattern analysts describe in Super Mario 3D World. [R] M
3. **Two routes on every race:** a fast, risky line and a slow, safe one. Runbow's branching lanes spread players out and created risk and reward. Keep a few levels chaotic on purpose. [R] M
4. **Fair failure:** the player should feel it was their own fault. [R] S
5. **One colour language across all maps:** purple is safe, orange is danger, green is about to vanish. [O] S
6. **Layout variants per map,** so the same map plays differently. [O] M
7. **One set piece per map:** the castle gates opening, the giant ghost bursting through a wall. [O] M
8. **Introduce one new game type per match** for the first few matches, so each match brings something new. [O] S
9. **About 80% skill to 20% chaos.** Attributed to the Fall Guys team by secondary reporting; I couldn't open the primary article. [R, weak] S

## 7. Game feel

1. **Floppy ragdoll on knockdown:** real limb physics rather than a spin. Gang Beasts keeps characters upright with an upward impulse on the pelvis (secondary source), and its physics shaped its character design. [R] L
2. **Expressive faces:** eyes that track hazards, go wide near danger, turn to X's when bonked, and a laugh on winning. [O] M
3. **Scaled hit-stop:** 30-50 ms for light hits, 60-100 for heavy. Today it's a flat 60 ms, for the player only. Use it once per impact. [R] S
4. **Squash, stretch and anticipation** on every jump, land and start, conserving volume, with no linear tweens. [R] S
5. **Restrained, decaying screen shake.** Juice is "seasoning, not the meal". [R] S
6. **Near-miss rewards:** "Close call!" when a hammer just misses, with a small candy bonus. [O] S
7. **Small touches:** surface-specific footsteps, skids on sharp turns, wall bonks, gamepad rumble, an FOV kick on bounce pads. [O] M
8. **Cute gibberish voices** for grunts, yelps and cheers. [O] M
9. **Real music and sound,** made or licensed by a person. The download budget allows it, and the current audio is unverified. Music that intensifies as spots run out. [O] M
10. **Lean into "unathletic but ambitious",** the Fall Guys character brief, by giving each monster its own run and stumble. [R] M

## 8. Home screen and UI

1. **One dominant Play button,** biggest, on its own row, and the only thing that animates. [R] S
2. **Open centre:** Brawl Stars leaves space in the middle for the character and groups actions around it. [R] S
3. **Labelled tabs** for Home, Shop, Locker and Event, as unclear icons get ignored. [R] S
4. **Next goal always visible:** "2 wins to unlock Ghost". [O] S
5. **One suggestion at a time,** picking the most valuable: reward ready, mission done, or rematch. [O] S
6. **Interactive hero:** poke it, make it dance, try on an outfit. [O] S
7. **Your Haunted Town: the home screen grows.** Wins light windows, add statues and open buildings, so progress is visible without a menu. [O] L
8. **Hub mini-games:** Eggy Party's menu is a social hub with mini-games, which gives players another reason to stay when they tire of matches. A small version: pumpkin bowling on the stage. [R] L
9. **Reward ceremony:** one reward at a time, numbers rolling up with sound, then "new unlock" with a chance to equip it right away. A clear, dominant Continue button. [R] M
10. **Motion and transitions:** a pumpkin-iris wipe between screens, springy buttons, a sound for each interaction. [O] M
11. **In-round info:** rival portraits dropping off, "spots left", an elimination feed. Keep the art simple enough that chaos stays readable. [R] M
12. **One visual language** across menus and game. [R] S

## 9. Retention systems

Targets from CrazyGames: conversion 80%+, average session 10+ minutes, day-1 retention 10-15%.

1. **Rank ladder:** Trick-or-Treater → Ghoul → Witch → Pumpkin King, with seasonal resets. [O] M
2. **Feel accomplished in 3 minutes:** one blog's view, but it fits: first match ends with an unlock, a level-up and a new goal. Don't ask for sign-in early. [R] S
3. **Cumulative login rewards, not punishing streaks.** Warframe switched for this reason. Our calendar currently restarts on a missed day. [R] S
4. **Banked missions** that wait for you, plus weekly goals. Daily quests work only while they feel optional. [R] S
5. **A real season track:** new rewards each season instead of repeating them, with a meaningful free track. One blog suggests 4-8 week seasons. [R, weak] M
6. **Seasonal events beyond Halloween:** Stumble Guys' Halloween update raised daily iOS revenue by 600%, a strong sign of how much events matter. Plan Harvest, Winter Witch and Friday the 13th. [R] L
7. **Give gems a purpose,** or remove them: a premium shop or rerolls. [O] S
8. **Collection album:** a "Monster Book" of skins and outfits. Customisation is widely credited with building attachment. [R] M
9. **Titles and achievements:** "Hammer Magnet", "100 Falls". They make failure funny. [O] S
10. **Modes for long-term players:** tournaments kept Stumble Guys players busy. Eggy Party runs two or three event modes at once and a ranked ladder. Start with one weekly challenge. [R] M
11. **Monster powers stay free and earned in-match.** Stumble Guys' purchasable boosts drew pay-to-win criticism. Eggy Party allows active skills only in the final stretch of a match, which is worth testing. [R] M
12. **Ad placements for later:** try an outfit for one match, an ad top-up when you're just short of coins, a free daily chest. [R] S
13. **Guardrails:** real timers only, no fake scarcity, nothing that punishes a day off. CrazyGames' audience is 13+. [O] S

## 10. Prove it's fun

1. **Watch 5-10 people play,** without helping. This is the most valuable item on the list. [O] S
2. **Listen to all the audio** on real speakers and a phone. [O] S
3. **Use Basic Launch as the live test:** 7+ days and 500+ plays, watching conversion, session length and day-1 retention. [R] S
4. **Hold the promo media:** the current covers and videos show Level-era visuals, so re-render them after the redesign. [O] S

## Suggested order

| Step | Contents | Why first |
|---|---|---|
| 1. Play test | Section 10, items 1-2 | Shows which of these ideas matter most |
| 2. Match flow | Section 1, items 1-3 and 6-8 | The structural change you asked for |
| 3. Originality | Haunt mode, Candy score, Trick or Treat Street, Lantern Night, Moonlight Freeze, Monster Mash, replace the two closest maps | Makes it a different game, not a reskin |
| 4. Personality | Rival identities, faces, ragdoll, real audio, host | Fixes the "unfinished" feeling most directly |
| 5. Home and rewards | Section 8, items 1-6 and 9-11 | First impression and session loop |
| 6. Retention | Crown Candy, ranks, missions, season track | Most useful once the core loop is fun |
| Later | Haunted Town, hub games, tournaments, new seasons, multiplayer | Bigger bets for after launch data |

## How solid this research is

- **Strongest:** CrazyGames' own docs, and developers' quotes on Warzone and Fall Guys.
- **Moderate:** the GameRefinery and Naavik analyses, which are opinion backed by market data and date from 2022-2023.
- **Weak:** most retention, battle pass and game-feel numbers, which come from blogs and vendor guides with varying samples. Treat them as starting points.
- **Not found:** data on how Stumble Guys uses bots, any independent study of bots and retention, and top-game rankings on CrazyGames. A bot vendor's "50% better day-1 retention" claim is marketing, so I've ignored it.
- **Couldn't open:** several primary articles returned errors (Creative Review, SCMP, GGRecon, Push Square, and two Medium pieces), so those points rely on search summaries. The EOMM findings also come from search summaries, because I couldn't extract the PDF's text here.

## Sources

CrazyGames: [Basic Launch metrics](https://docs.crazygames.com/resources/basic-launch-metrics/), [Quality guidelines](https://docs.crazygames.com/requirements/quality/), [Gameplay requirements](https://docs.crazygames.com/requirements/gameplay/), [Action monetization](https://docs.crazygames.com/resources/monetizing-action/), [Rewarded ads](https://docs.crazygames.com/resources/rewarded-ads-deep-dive/)

Party games: [GameRefinery: Stumble Guys vs Eggy Party](https://www.gamerefinery.com/stumble-guys-vs-eggy-party-which-fall-guys-clone-is-the-king-of-mobile/), [Naavik: Stumble Guys](https://naavik.co/digest/stumbleguys-garenafreefire/), [Stumble Guys site](https://www.stumbleguys.com/), [Stumble Guys on Google Play](https://play.google.com/store/apps/details?id=com.kitkagames.fallbuddies&hl=en), [Game Developer: Fall Guys Q&A](https://www.gamedeveloper.com/design/q-a-designing-for-seasons-in-bumbling-platform-royale-i-fall-guys-i-), [Fall Guys Crown Shards](https://svg.com/372173/fall-guys-crown-shards-currency-explained), [Fall Guys round selection](https://cyberpost.co/?p=272264), [GG Recon: Fall Guys characters](https://www.ggrecon.com/articles/fall-guys-developers-reveal-what-makes-their-jelly-beans-so-lovable), [Fall Guys declining numbers](https://www.gamerevolution.com/?p=660313), [Ultimate Chicken Horse review](https://www.nintendoworldreport.com/review/48476)

Battle royale and matchmaking: [Engadget: Warzone developers](https://www.engadget.com/call-of-duty-warzone-gulag-battle-royale-infinity-ward-raven-interview-140051484.html), [Pixel Twelve: battle royale](https://pixeltwelve.com/genres/battle-royale), [EOMM paper](https://arxiv.org/pdf/1702.06820), [Losing-streak matchmaking model](https://par.nsf.gov/servlets/purl/10446744), [INFORMS summary](https://www.informs.org/News-Room/INFORMS-Releases/News-Releases/Smarter-Matchmaking-Not-Just-Equal-Skill-Could-Keep-Millions-More-Gamers-Playing-Study-Finds), [Mario Kart items](https://www.cheatcc.com/?p=211624), [Runbow design](https://www.gamedeveloper.com/design/designing-for-local-hordes-problems-and-solutions-for-9-player-design-in-runbow)

Game feel and level design: [Godot game feel checklist](https://forum.godotengine.org/t/game-feel-checklist-for-godot-4-hit-stop-trauma-shake-coyote-time-and-more/145340), [Wayline game feel](https://www.wayline.io/learn/game-feel/1), [Hackread: the juice factor](https://hackread.com/the-juice-factor-designing-game-feel/), [Active ragdoll report](https://gradex.staffs.ac.uk/wp-content/uploads/2025/05/5150_Artefact-Dev-Report-GradEx.pdf), [Gang Beasts developer video](https://gamedeveloper.com/design/video-multiplayer-brawling-with-i-gang-beasts-i-), [Mario level design in four steps](https://www.mcvuk.com/development/video-nintendos-level-design-secrets-in-four-steps), [Kishotenketsu note](https://kitsunethegame.blogspot.com/2016/03/kishotenketsu-nintendo-formula-for.html)

UI: [GameAnalytics: game UI](https://www.gameanalytics.com/blog/how-to-make-your-game-ui-shine-and-increase-conversions), [Brawl Stars menu analysis](https://medium.com/swlh/brawl-stars-what-makes-it-great-3861dfb169fb), [Brawl Stars critique](https://ixd.prattsi.org/2025/02/design-critique-brawl-stars/), [Mobile lobby UI study](https://koreascience.or.kr/article/JAKO201909055503142.do)

Retention: [Pixelfield](https://pixelfield.co.uk/blog/how-to-design-games-for-retention/), [Segwise benchmarks](https://segwise.ai/blog/mobile-gaming-app-user-retention-strategies.md), [Certainly: retention](https://www.certainly.io/blog/designing-for-retention-lessons-from-the-most-addictive-online-games), [Warframe reward loops](https://saschb2b.github.io/game-mechanics/games/warframe/reward-loops), [Throne and Liberty pass FAQ](https://www.playthroneandliberty.com/news/articles/battle-pass-faq), [Guild Wars 2 pass redesign](https://gamedeveloper.com/production/deep-dive-reimagining-the-battle-pass-to-maximize-enjoyment-in-guild-wars-2), [Battle pass design guide](https://abratabia.com/game-economy/battle-pass-design.php)
