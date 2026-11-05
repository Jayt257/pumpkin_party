import { build as pumpkinDash } from './pumpkinDash.js';
import { build as ghostChase } from './ghostChase.js';
import { build as hauntedFloor } from './hauntedFloor.js';
import { build as witchsPlatform } from './witchsPlatform.js';
import { build as pumpkinRoll } from './pumpkinRoll.js';
import { build as finalShowdown } from './finalShowdown.js';

/**
 * Level catalog: order and metadata match the World 1 selection screen.
 * To add a map later: write a build(ctx) in a new file and list it here.
 *
 * stars: seconds to beat for 2 and 3 stars in a solo race. Survival levels award stars by placement.
 */
export const LEVELS = {
  pumpkinDash: { id: 'pumpkinDash', name: 'Pumpkin Dash', build: pumpkinDash, mode: 'race', objective: 'Race to the Finish!', quotaDefault: 12, playersDefault: 16, stars: [75, 60], world: 1, hint: 'Time your run under the hammers.' },
  ghostChase: { id: 'ghostChase', name: 'Ghost Chase', build: ghostChase, mode: 'race', objective: 'Outrun the giant ghost!', quotaDefault: 12, playersDefault: 16, stars: [62, 50], world: 1, hint: 'The ghost never stops. Keep running!' },
  hauntedFloor: { id: 'hauntedFloor', name: 'Haunted Floor', build: hauntedFloor, mode: 'survive', objective: 'Stay on the floor!', quotaDefault: 6, playersDefault: 12, world: 1, hint: 'Floor panels drop after you touch them. Keep moving!' },
  witchsPlatform: { id: 'witchsPlatform', name: "Witch's Platform", build: witchsPlatform, mode: 'survive', objective: 'Survive!', quotaDefault: 6, playersDefault: 12, world: 1, hint: 'Glowing green pillars are about to sink.' },
  pumpkinRoll: { id: 'pumpkinRoll', name: 'Pumpkin Roll', build: pumpkinRoll, mode: 'race', objective: 'Dodge the pumpkins!', quotaDefault: 9, playersDefault: 12, stars: [68, 54], world: 1, hint: 'Hide behind the blocks when a pumpkin rolls by.' },
  finalShowdown: { id: 'finalShowdown', name: 'Final Showdown', build: finalShowdown, mode: 'last', objective: 'Last one standing!', quotaDefault: 1, playersDefault: 6, world: 1, hint: 'Jump the spinning beams.', lockedUntilStars: 8 },
};

export const LEVEL_ORDER = ['pumpkinDash', 'ghostChase', 'hauntedFloor', 'witchsPlatform', 'pumpkinRoll', 'finalShowdown'];

/**
 * A full match: five rounds, each keeping fewer players. Round 2 alternates between the two middle
 * races so repeat matches stay fresh; the first match always starts on the most readable course.
 */
export function matchPlan(matchIndex = 0, rand = Math.random) {
  const mid = rand() < 0.5 ? 'ghostChase' : 'pumpkinRoll';
  const survive = rand() < 0.5 ? ['hauntedFloor', 'witchsPlatform'] : ['witchsPlatform', 'hauntedFloor'];
  const first = matchIndex === 0 || rand() < 0.6 ? 'pumpkinDash' : mid;
  const second = first === 'pumpkinDash' ? mid : 'pumpkinDash';
  return [
    { level: first, players: 16, quota: 12 },
    { level: second, players: 12, quota: 9 },
    { level: survive[0], players: 9, quota: 6 },
    { level: survive[1], players: 6, quota: 3 },
    { level: 'finalShowdown', players: 3, quota: 1 },
  ];
}
