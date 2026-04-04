import { NarrationRegistry } from "./NarrationRegistry.js";

NarrationRegistry.register("attack.hit", [
  "{attacker} lunges forward and strikes {defender} for {damage} damage!",
  "{attacker} lands a solid blow on {defender}, dealing {damage} damage!",
  "With a fierce swing, {attacker} slashes {defender} for {damage} damage!",
  "{attacker} connects with a powerful attack against {defender} — {damage} damage!",
]);

NarrationRegistry.register("attack.miss", [
  "{attacker} swings at {defender} but misses!",
  "{defender} sidesteps {attacker}'s attack!",
  "{attacker}'s strike glances off {defender} harmlessly.",
]);

NarrationRegistry.register("defend.player", [
  "{player} raises their guard, bracing for the coming blow.",
  "{player} takes a defensive stance, shield arm forward.",
  "{player} steadies themselves and prepares to absorb the attack.",
]);

NarrationRegistry.register("defend.armor_blocked", [
  "{armor} absorbs part of the blow, deflecting {damageBlocked} damage.",
  "The {armor} holds firm — {damageBlocked} damage is turned aside.",
  "{armor} takes the brunt of the strike, blocking {damageBlocked} damage.",
  "The reinforced {armor} redirects {damageBlocked} damage away from {player}.",
]);

NarrationRegistry.register("ability.damage", [
  "{player} unleashes {ability} at {target} for {damage} damage!",
  "{player} channels {ability} — it tears into {target} for {damage} damage!",
]);

NarrationRegistry.register("ability.fireball", [
  "{player} hurls a roaring Fireball at {target}! It detonates for {damage} blazing damage!",
  "{player} incants and a sphere of fire erupts — {target} takes {damage} damage!",
]);

NarrationRegistry.register("ability.lightning", [
  "{player} calls down a bolt of lightning upon {target} — {damage} crackling damage!",
  "The air smells of ozone as {player}'s Lightning Strike hits {target} for {damage}!",
]);

NarrationRegistry.register("ability.freeze", [
  "{player} chants the words of frost — ice crystals tear through {target} for {damage} cold damage!",
  "A burst of arctic cold from {player} encases {target} momentarily — {damage} damage!",
]);

NarrationRegistry.register("ability.inferno", [
  "{player} unleashes an Inferno, engulfing all enemies in roaring flame! ({damage} each)",
  "Roaring fire sweeps the room from {player}'s Inferno — {damage} damage each!",
]);

NarrationRegistry.register("ability.heal", [
  "A warm golden light envelops {player} as they cast Heal, restoring {amount} HP.",
  "{player} channels healing energy — {amount} HP restored.",
]);

NarrationRegistry.register("ability.shield", [
  "{player} conjures a shimmering barrier of force around themselves.",
  "A translucent shield materializes around {player}, deflecting future blows.",
]);

NarrationRegistry.register("ability.meteor_strike", [
  "{player} raises their arms to the heavens — a blazing meteor tears through the dungeon ceiling and detonates among the enemies! ({damage} damage each!)",
  "The sky itself answers {player}'s call. A meteor screams down and erupts in an inferno, scorching everything! ({damage} each)",
]);

NarrationRegistry.register("ability.poison_dart", [
  "{player} flings a venomous dart at {target}! It buries itself deep — {damage} damage and the venom seeps in.",
  "{player} draws a dart dipped in poison and hurls it at {target} for {damage} damage!",
]);

NarrationRegistry.register("ability.no_mana", [
  "{player} reaches for the arcane to cast {ability}, but the well is empty. Not enough mana!",
  "The mana for {ability} isn't there — {player} grits their teeth in frustration.",
]);

NarrationRegistry.register("ability.no_target", [
  "{player} tries to cast {ability}, but there's no valid target in range.",
  "No target for {ability}. Focus before casting!",
]);

NarrationRegistry.register("status.applied.POISON", [
  "{target} is poisoned — the venom will gnaw at them each turn!",
  "A sickly green aura clings to {target}. Poison courses through their veins.",
]);

NarrationRegistry.register("status.applied.STUN", [
  "{target} reels, dazed and unable to act this round!",
  "The blow staggers {target} — they're stunned!",
]);

NarrationRegistry.register("status.applied.BURN", [
  "{target} is on fire! Burning damage will continue each turn.",
  "Flames lick across {target}'s body. They're burning!",
]);

NarrationRegistry.register("status.applied.SHIELD", [
  "A shimmering barrier forms around {target}.",
  "{target} is protected by a magical shield.",
]);

NarrationRegistry.register("status.applied.HASTE", [
  "{target} surges with speed — they'll act before others!",
  "{target} feels supernaturally fast.",
]);

NarrationRegistry.register("status.tick.POISON", [
  "Poison burns through {target}'s blood — {damage} damage!",
]);

NarrationRegistry.register("status.tick.BURN", [
  "Flames scorch {target} for another {damage} damage!",
]);

NarrationRegistry.register("status.tick.STUN", [
  "{target} is still stunned and cannot act.",
]);

NarrationRegistry.register("status.tick.SHIELD", [
  "{target}'s shield holds steady.",
]);

NarrationRegistry.register("status.tick.HASTE", [
  "{target} moves with unnatural speed.",
]);

NarrationRegistry.register("status.expired.POISON", [
  "The poison in {target}'s veins finally fades.",
]);

NarrationRegistry.register("status.expired.STUN", [
  "{target} shakes off the daze and regains their senses.",
]);

NarrationRegistry.register("status.expired.BURN", [
  "The flames consuming {target} sputter out.",
]);

NarrationRegistry.register("status.expired.SHIELD", [
  "{target}'s magical barrier dissipates.",
]);

NarrationRegistry.register("status.expired.HASTE", [
  "The haste effect on {target} wears off.",
]);

NarrationRegistry.register("enemy.defeated.GOBLIN", [
  "The {name} lets out a dying squeal and crumples to the ground!",
  "With a final gurgle, the {name} collapses!",
]);

NarrationRegistry.register("enemy.defeated.MAGE", [
  "The {name}'s arcane fire sputters out as they fall!",
  "With a strangled gasp, the {name} dissolves into sparks!",
]);

NarrationRegistry.register("enemy.defeated.TANK", [
  "The massive {name} topples like a felled oak!",
  "The {name} crashes to the floor, shaking the dungeon walls!",
]);

NarrationRegistry.register("enemy.defeated.SKELETON", [
  "The {name} shatters into a pile of rattling bones!",
  "Bones scatter across the floor as the {name} is destroyed!",
]);

NarrationRegistry.register("enemy.defeated.BOSS", [
  "With a thunderous roar, the mighty {name} falls! The dungeon trembles in silence.",
  "The {name} lets out a final, earth-shaking scream and collapses!",
]);

NarrationRegistry.register("enemy.turn.GOBLIN", [
  "The {name} darts forward and slashes you for {damage} damage!",
  "Cackling, the {name} bites at you — {damage} damage!",
]);

NarrationRegistry.register("enemy.turn.MAGE", [
  "The {name} chants a hasty hex — arcane energy strikes for {damage} damage!",
  "A bolt of dark magic erupts from the {name} and slams into you — {damage} damage!",
]);

NarrationRegistry.register("enemy.turn.TANK", [
  "The {name} charges with a bone-crushing blow for {damage} damage!",
  "The {name} raises its weapon and smashes you for {damage} damage!",
]);

NarrationRegistry.register("enemy.turn.SKELETON", [
  "The {name}'s bony claws rake across you — {damage} damage!",
  "The {name} rattles forward and strikes you for {damage} damage!",
]);

NarrationRegistry.register("enemy.turn.BOSS", [
  "The {name} unleashes a devastating strike for {damage} damage!",
  "With a thunderous roar, {name} smashes you for {damage} damage!",
]);

NarrationRegistry.register("player.defeated", [
  "{player} falls to the dungeon floor. The darkness closes in...",
  "Overwhelmed, {player} collapses. The dungeon claims another soul.",
  "{player}'s vision fades. Defeat.",
]);

NarrationRegistry.register("combat.start", [
  "Combat begins! You face {enemies}. Steel yourself!",
  "The dungeon erupts — {enemies} attack! Ready your weapons!",
  "{enemies} emerge from the shadows — battle is joined!",
]);

NarrationRegistry.register("combat.victory", [
  "Victory! The last enemy crumbles. The dungeon falls silent once more.",
  "Your foes are vanquished. A moment of silence in the dark.",
  "All enemies are defeated. You breathe heavily, victorious.",
]);

NarrationRegistry.register("room.entry.new", [
  "You enter {room}. {description}",
]);

NarrationRegistry.register("room.entry.revisit", [
  "You return to {room}.",
]);

NarrationRegistry.register("room.blocked", [
  "Enemies block the path. There is no escape — face them or fall!",
  "You cannot flee. The enemies stand between you and the exit.",
  "Every exit is blocked. Defeat your foes first!",
]);

NarrationRegistry.register("room.no_exit", [
  "You head {direction}, but solid stone wall stops you cold. No path that way.",
  "There is no passage to the {direction} from here.",
]);

NarrationRegistry.register("move.north", ["You move north..."]);
NarrationRegistry.register("move.south", ["You move south..."]);
NarrationRegistry.register("move.east", ["You move east..."]);
NarrationRegistry.register("move.west", ["You move west..."]);
NarrationRegistry.register("move.up", ["You ascend upward..."]);
NarrationRegistry.register("move.down", ["You descend downward..."]);

NarrationRegistry.register("event.trap.hit", [
  "A hidden pressure plate clicks — darts shoot from the walls! You take {damage} damage!",
  "The floor gives way for a split second — spikes graze you for {damage} damage!",
  "A tripwire snaps and releases a swinging blade — {damage} damage!",
]);

NarrationRegistry.register("event.trap.dodge", [
  "You notice the glint of a pressure plate and step carefully around it.",
  "Sharp eyes catch a tripwire in time. You step over it safely.",
]);

NarrationRegistry.register("event.treasure", [
  "You discover a glinting treasure chest. Inside lies a {item}!",
  "Hidden in a crevice you find a {item}!",
]);

NarrationRegistry.register("event.treasure.gold", [
  "You also find {gold} gold coins glinting in the dust.",
  "Alongside it you pocket {gold} gold.",
]);

NarrationRegistry.register("item.pickup", [
  "You pick up the {item} and add it to your pack.",
  "You claim the {item}.",
]);

NarrationRegistry.register("item.used", [
  "{player} uses the {item}. {effect}",
]);

NarrationRegistry.register("xp.gained", [
  "You gain {amount} experience.",
]);

NarrationRegistry.register("gold.gained", [
  "You pocket {amount} gold.",
]);

NarrationRegistry.register("level.up", [
  "Brilliant light washes over {player} — LEVEL UP! Now level {level}. HP +15 | MP +10 | ATK +3 | DEF +2.",
]);

NarrationRegistry.register("flee.success", [
  "You break away from combat and sprint {direction}!",
  "You bolt {direction} and escape the melee!",
]);

NarrationRegistry.register("flee.fail", [
  "You bolt for the exit — but the enemies cut you off!",
  "Your retreat is blocked. You must fight your way out!",
]);
