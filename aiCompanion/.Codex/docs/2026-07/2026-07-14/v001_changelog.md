# v001 Changelog

- Fixed knowledge-graph primary entity selection to prefer explicit name columns such as `需求英雄`, `英雄名称`, `角色名称`, `name`, and `title`.
- Replaced the old permissive fallback with conservative scoring so low-signal fields like `英雄级别`, `截图`, `跳转`, notes, URLs, dates, and paths are no longer promoted to entities.
- Rebuilt graph data for `documentId=62` (`灯塔SLG项目英雄档案需求.xlsx`), which now produces hero entities instead of `S+ / S / A`.
- Tightened the graph modal empty-state rendering to write into the dedicated graph stage container.
- Reworked `server/src/services/excelParser.js` to distinguish standard tabular sheets from layout-heavy sheets and aggregate the latter into block entries with Excel row-range metadata.
- Tightened the parser heuristics so ordinary tables (for example `目录`) stay row-based while merged title + label/value sheets switch to block import.
- Updated `server/src/services/ingestWorker.js` so embedded images can attach to block entries by row range instead of exact-row matching only.
- Added a transpose parser mode for skill sheets arranged by column, so each skill column imports as its own entry with the skill name retained as the primary field.
- Extended `server/src/services/imageExtractor.js` and `server/src/services/ingestWorker.js` to carry Excel image anchor columns, allowing embedded skill icons to match the correct imported skill entry instead of row-only fallback.
- Added parser regression coverage for mixed table/block imports in `server/test/excelParser.test.js`.
- Expanded parser regression coverage to include transpose-style skill sheets with `技能名称 / 技能基础效果 / 一星效果 / 二星效果` rows.
- Rebuilt `web/js/pages/knowledge.js` so preview cards show import mode, sheet name, Excel row range, readable structured fields, and larger image thumbnails.
- Redesigned the knowledge upload area into a larger drag-and-drop panel and switched file selection to auto-start upload/parse without a second confirm click.
- Switched knowledge preview image thumbnails to an in-page overlay with close button, background click close, and `Esc` close.
- Added upload status chips and front-end cache-busting version `20260714-kbfix4` so the new upload experience can be seen immediately after refresh.
- Extended hero preview aggregation in `web/js/pages/knowledge.js` so skill content remains visible while foundational hero fields are also rendered from the detail sheet, including faction/camp, class/profession, rarity, max-level marker, base stats, hero quote, and attribute notes.
- Verified against imported document `69` (`灯塔SLG项目英雄档案需求.xlsx`) that the preview now shows both hero基础信息 and 技能信息, and that related images are mounted in the preview.
- Switched the knowledge graph modal to a summary-first experience for sparse/noisy extraction results, with relation cards, entity chips, noise-node de-emphasis, and a readable left-to-right hierarchical graph tab when enough usable relations exist.
