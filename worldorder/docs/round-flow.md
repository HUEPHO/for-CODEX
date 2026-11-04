# Round flow implementation references

Source: user-supplied World Order Rulebook v1.0, pp.11–12,17,19–21; World in Turmoil v1.0 p.7. Human four-player game only.

- Base p.11: first round skips preparation; draw six; advance each country's left pile onto right, recombine if left exhausted; lower VP chooses any free turn slot first, ties by current money then starting money; primary production then focus.
- Base p.12: four turns per power. Playing an additional card within a turn does not advance the turn counter. The explicit End Action command advances it.
- Base p.17: research in turn order, skipped round six. Played cards discarded, remaining hand upper bonuses awarded, lower research totaled; Domestic Focus adds two. Country exhaustion adds its printed value. Purchases go immediately atop deck and market refills immediately. Pay two to discard rightmost three market cards. At research completion discard remaining hand and expire unspent research.
- Base pp.19–21: investment, prosperity, threat; scoring in rounds three/six. Unused strategic assets award two each at final scoring. Winner tie breakers require final regional majority wins then total map influence.
- WIT p.7: event phase after action/research and before aftermath; public events right to left then personal events in turn order.

Manual boundaries: action-card effects, production tracks, focus immediate effects, investments, prosperity, threat, regional/majority/objective/SP scoring, and winner tie breaks. Flow confirmations attest to the human having resolved these; they must never be described as automated scoring. Research costs, hand bonuses and country values now use imported TTS metadata, with representative face checks for every distinct ability metadata pattern; they no longer accept user-entered amounts. Research diplomacy is capped at 10 (excess lost), armies are uncapped (base p.15). Room synchronization and private player views are not implemented.

Old completed saves are not migrated to a later-round flow from potentially manually edited state. Reset explicitly opts in; pending setup starts the flow upon final confirmation. Undo uses prior immutable state snapshots.
