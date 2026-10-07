/* ============================================================================
   Обёртка над tools/mirror-static.js, оставленная ради совместимости.

   Раньше этот файл зеркалил только игры. Теперь общий инструмент умеет и
   игры (games/<slug>/), и приложения (apps/<slug>/), а имя mirror-games.js
   сохранено: на него ссылаются комментарии в assets/data/projects.js и
   README, и ломать привычную команду незачем.

   Запуск из корня проекта:
     node tools/mirror-games.js            # все игры
     node tools/mirror-games.js deddemo    # только одну

   Приложения этой обёрткой не собираются намеренно — только игры.
   Для приложений: node tools/mirror-static.js apps/<slug>
   ============================================================================ */
'use strict';

const { run } = require('./mirror-static');

run(process.argv.slice(2), { sections: ['games'] })
  .catch(e => { console.error(e); process.exit(1); });
