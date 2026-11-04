# Printed economy checkpoint

Sources: four supplied board-US/CN/EU/RU.webp images; base v1.0 pp.11 (preparation/focus), 15 (production and resource limits), 19 (one prosperity step per round), 23 (primary +1 applies to focus upgrades only).

New games carry economyVersion=1, seven production levels initialized from printed starting values, and prosperity=0. Older saves lack trustworthy historical production/prosperity; they retain manual confirmation. Starting a new table opts into automation, with no destructive migration.

- Primary production once per preparation: energy/raw materials/food at current production.
- Stocks cap at 10; primary overflow pays 3 money, consumer-goods/services overflow pays 10. Excess diplomacy is lost. Armies have no supply cap.
- Focus: ready selected exhausted allied countries, optionally pay for production upgrades, then choose how many secondary resources to produce. Every action is committed atomically through applyAction's state clone. Failure retains resources, readiness, production levels and turn ownership.
- Domestic: goods cost one energy + one raw material; services one energy + one food. Diplomacy costs three money each. Armies cost one raw material + one food. New production levels apply immediately to production limits; each primary upgraded through focus immediately grants one resource.
- Country-specific caps, upgrade costs (US8/CN6/EU7/RU6), EU readiness (2/5/3 vs 1/4/2), and CN two DIFFERENT domestic upgrades for 15 are represented explicitly.
- Prosperity: each player chooses once per round in order. Goods cost 2/3/4/5/6 by destination; each power uses its printed VP/money rewards. Fifth level grants zero money. Full track disables further improvement.
- Production adjustments in the player panel are explicitly manual card-effect recording, not free paid upgrades and not automatic resource grants. A direct focus switch is only allowed for the current player in the focus step.

Not automated here: card-specific production discounts/extra outputs, Commerce-card flipping, threat/Engage and diplomatic ongoing abilities other than the already-implemented domestic +2 research, full ability effects, investments and majority/region scoring. Printed basic economics must not be described as a complete card engine.

Validation: focused check-economy.mjs plus existing six-round smoke test. No browser QA requested or performed.
