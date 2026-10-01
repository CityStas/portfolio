/* ============================================================================
   КОНТЕНТ САЙТА. Правится только этот файл — вёрстку трогать не нужно.
   ----------------------------------------------------------------------------
   Карточка проекта:
     title    — название
     kind     — тип: 'AI-продукт' | 'Игра' | 'Сайт' | 'Расширение' | 'Инструмент'.
                Он же задаёт чипы-фильтры над сеткой: порядок чипов — это порядок
                первых появлений kind. Добавился новый тип проекта — сам добавился
                и чип. Ярлык группы берётся из THEME_LABEL (app.js), например
                'Игра' -> «Игры».
     themes   — необязательно: массив тем, если проект лежит сразу в нескольких
                (игра + AI-инструмент). Тогда kind остаётся подписью карточки,
                а в фильтры проект попадает по каждой теме из массива.
     desc     — 1–3 строки описания. Пустая строка (\n\n) разделяет абзацы,
                а абзац, начинающийся со «*», рисуется сноской — мельче и глуше
                основного текста. Так сделано у ORFree: «OpenRouter*» в тексте,
                «* Внимание: …» отдельным абзацем. Однострочное описание
                выглядит ровно как раньше.
     tags     — массив строк; выводятся чипами на карточке
     year     — год или период
     status   — 'live' | 'wip' | 'archived'; 'live' бейджа не получает — это
                нормальное состояние, значок нужен только для wip/archived
     shot     — превью, путь от корня сайта
     shots    — необязательно: галерея для лайтбокса. Массив путей; в просмотре
                снизу появляется полоска кадров, переключение по клику. Один
                кадр в массиве = полоски нет. shot при этом остаётся превью
                карточки, поэтому «на карточке кадр 2, в просмотре открывается 1»
                задаётся так: shot: '.../2.jpg', shots: ['.../1.jpg', '.../2.jpg']
     shotPos  — необязательно: куда сдвинуть кадр внутри карточки, если он шире
                пропорции 16:10. Значение как у object-position, например '70% 50%':
                0% — показывать левый край, 100% — правый. По умолчанию центр.
     clip     — необязательно: короткий зацикленный клип, mp4. Если задан, в карточке
                поверх постера играет видео (только когда карточка на экране), а в
                лайтбоксе оно открывается с управлением. Клип режется из сырой
                записи экрана: node tools/clip.js <slug>  (см. tools/clip.js)
     clipWebm — второй источник, VP9. Легче mp4; в разметке идёт первым, браузер
                берёт его, если умеет, иначе молча откатывается на clip
     clipPoster — кадр-заглушка до загрузки видео; по умолчанию берётся shot
     links    — { demo: 'https://...', demoLabel: 'RuStore', demoIcon: 'store', demoEmbed: true, web: 'https://...', repo: 'https://...' }
                demoLabel — подпись главной кнопки, по умолчанию «Открыть сайт»;
                            у игровых демо — 'Demo', у RuStore — 'RuStore'
                demoIcon  — 'store' рисует иконку магазина приложений, иначе внешнюю ссылку
                demoEmbed — true: клик по demo открывает демо в окне монитора прямо
                            на странице, а не новой вкладкой. Ставить только тем
                            сайтам, которые не запрещают показ в iframe
                            (нет X-Frame-Options и CSP frame-ancestors) и умеют
                            работать с клавиатуры. На узких окнах, где стекло
                            экрана вышло бы меньше 430 px, ссылка всё равно
                            открывается в новой вкладке.
                demo      — локальное зеркало: '/games/<slug>/' у игр,
                            '/apps/<slug>/' у сайтов. Файлы лежат в этом же
                            репозитории и отдаются с того же домена.
                            Причина — DPI провайдеров режет TLS к Vercel по SNI
                            <slug>.dvodev.space: замер 2026-09-27, один и тот же
                            IP, 12 попыток на каждый SNI —
                              dubbed.dvodev.space   6/12, ECONNRESET
                              orfree.dvodev.space   0/12, таймаут 12 с
                              dubbedru.vercel.app  12/12, 61 мс
                              orfreeweb.vercel.app 12/12, 45 мс
                            То есть режется не Vercel, а кастомный домен поверх
                            него. GitHub Pages тот же SNI отдаёт без потерь.
                            Обновить зеркало: node tools/mirror-static.js [slug]
                            (только игры: node tools/mirror-games.js [slug])
                web       — второй канал рядом с demo, подписывается «Веб-версия»
   ============================================================================ */

window.SITE = {
  name: 'Дмитрий О.',
  role: 'AI-Native Developer / Full-Stack AI Engineer',
  tagline: 'AI-продукты полного цикла: исследование моделей, прототип, backend, деплой. Отдельно - свои игры на Godot и three.js.',
  location: 'Екатеринбург',

  hh: 'https://hh.ru/resume/d887856aff0eea819f0039ed1f574e52717661',
  // PDF-резюме нет: удалено и из шапки, и из контактов. Осталось только HH.
  cv: '',
  telegram: 'https://t.me/citystas',
  // Исходники этого сайта. renderContacts (app.js) рисует кнопку «GitHub» с
  // подписью CityStas последней в списке контактов. Почта по-прежнему скрыта.
  github: 'https://github.com/CityStas/portfolio',

  about: [
    'AI-Native Developer / Full-Stack AI Engineer с опытом разработки AI-продуктов полного цикла - от исследования моделей и прототипирования до backend, интеграции и deployment. Специализируюсь на AI-driven development, проектировании AI-workflows и агентных систем, prompt engineering и evaluation моделей. Использую AI как часть инженерного процесса: автоматизирую разработку, тестирую и сравниваю модели, оптимизирую качество, скорость и затраты.',
    'Увлекаюсь геймдевом, разрабатываю собственные игровые проекты на Godot и Three.js с использованием AI-инструментов. Люблю видеоигры, особенно FPS. Готов активно развиваться в геймдеве, осваивать новые технологии и применять свой опыт AI-разработки для создания игровых продуктов.'
  ],

  facts: [
    ['Опыт', '2+ года в разработке и инфраструктуре'],
    ['Полный цикл', 'research → prototype → backend → deploy'],
    ['Фокус', 'AI Engineer / LLM Integration Engineer / AI Full-Stack Engineer'],
    ['Формат', 'Удалённо / Готов к командировкам']
  ]

  // Раздел «Стек» убран целиком (2026-10-01): сама секция, пункт меню, рендер
  // в app.js и стили .stack* в style.css. Данные стека удалены вместе с ними —
  // вернуть раздел значит вернуть все четыре части.
};

window.PROJECTS = [
  {
    title: 'DedSpace 2D',
    kind: 'Игра',
    desc: '2D-платформер на Godot 4: игрок, подбор предметов, враги, уровни. Оптимизирован под работу в браузере.',
    tags: ['Godot 4', 'GDScript', '2D', 'Web', 'Web-экспорт'],
    year: '2026',
    status: 'live',
    shot: 'assets/img/projects/shrooms.jpg',
    links: { demo: '/games/deddemo/', demoLabel: 'Demo', demoEmbed: true, repo: '' }
  },
  {
    title: 'Bubble Peaks 3D',
    kind: 'Игра',
    desc: 'Трёхмерный уровень на Godot 4 с Forward+ рендером: свет, материалы, рельеф. Оптимизирован под работу в браузере.',
    tags: ['Godot 4', '3D', 'Forward+', 'Web', 'Web-экспорт', 'Освещение'],
    year: '2026',
    status: 'live',
    shot: 'assets/img/projects/bubblepeaks.jpg',
    links: { demo: '/games/bubblepeaks/', demoLabel: 'Demo', demoEmbed: true, repo: '' }
  },
  {
    title: 'LILCRAFT 3D',
    kind: 'Игра',
    desc: 'Воксельная песочница в браузере на three.js: генерация чанков, меш-оптимизация, сохранение мира + "пасхалка".',
    tags: ['three.js', 'WebGL', 'Voxel', 'Web', 'Чанки', 'Меш-оптимизация', 'Сохранение мира'],
    year: '2025-2026',
    status: 'live',
    shot: 'assets/img/projects/lilcraft.jpg',
    links: { demo: '/games/lilcraft/', demoLabel: 'Demo', demoEmbed: true, repo: '' }
  },
  {
    title: 'БАЗА Скейтборды',
    kind: 'Сайт',
    desc: 'Витрина магазина скейтбордов: переадресация в бизнес-профиль Авито.',
    tags: ['HTML/CSS', 'JavaScript', 'GitHub Pages', 'Адаптив'],
    year: '2025-2026',
    status: 'live',
    shot: 'assets/img/projects/bazaskate.jpg',
    links: { demo: 'https://bazaskate.shop/', repo: '' }
  },
  {
    title: 'Dubbed',
    kind: 'Расширение',
    desc: 'Расширение для Chrome/Firefox: переводит и озвучивает видео прямо на странице сайта.',
    tags: ['JavaScript', 'MV3', 'Chrome', 'Firefox', 'TTS', 'Субтитры'],
    year: '2025-2026',
    status: 'live',
    shot: 'assets/img/projects/dubbed.jpg',
    // Лендинг зеркалится в apps/dubbed/ вместе с установщиками: с dubbed.dvodev.space
    // без VPN отдавалась примерно половина запросов, и .zip/.xpi могли не скачаться.
    links: { demo: '/apps/dubbed/', repo: '' }
  },

  // Превью - страница RuStore: единственная ссылка карточки. Веб-версия и
  // Telegram-бот убраны; вернуть — снова прописать web и tg в links.
  {
    title: 'ОРФ AI',
    kind: 'AI-продукт',
    desc: 'AI-чат-ассистент для Android - динамический выбор LLM через OpenRouter* по запросу, доступности и latency. Capacitor, RuStore.\n\n*Важно: из-за геоблокировки со стороны OpenRouter для корректной работы моделей на территории РФ нужен прокси/VPN.',
    tags: ['LLM', 'OpenRouter', 'Capacitor', 'Android', 'RuStore', 'Prompt Engineering'],
    year: '2025-2026',
    status: 'live',
    shot: 'assets/img/projects/rustore.jpg',
    links: {
      demo: 'https://www.rustore.ru/catalog/app/com.orfree.app',
      demoLabel: 'RuStore',
      demoIcon: 'store'
    }
  },

  // HC AI замыкает список: сайт открывается играми, а флагманский AI-проект
  // стоит последним — под него ведёт ссылка на репозиторий, и он не спорит
  // с крупным заголовком над сеткой.
  {
    title: 'HC AI',
    kind: 'AI-продукт',
    desc: 'Локальный мультимодальный ИИ-агент для Windows: чат, генерация изображений, зрение, upscale. Без интернета, облака и API-ключей.\n\n*В репозитории только код: модели (~13 ГБ) качаются скриптами по README.',
    tags: ['Electron', 'React', 'node-llama-cpp', 'GGUF', 'Vulkan', 'stable-diffusion.cpp', 'Vision', 'Offline'],
    year: '2026',
    status: 'live',
    // На карточке — результат генерации (кадр 2): по нему сразу видно, что
    // приложение делает. В просмотре открывается кадр 1, интерфейс.
    shot: 'assets/img/projects/hcai-2.jpg',
    shots: ['assets/img/projects/hcai-1.jpg', 'assets/img/projects/hcai-2.jpg'],
    links: { repo: 'https://github.com/CityStas/hc_local_ai_image' }
  }

  // Шаблон карточки с клипом. Раскомментировать, когда появится запись:
  // файлы кладёт tools/clip.js в assets/media/, сырьё лежит в _raw/ и в git не идёт.
  // {
  //   title: 'ModelLab',
  //   kind: 'Инструмент',
  //   desc: 'Подбор конфигурации локальных LLM под agentic-нагрузку: свип по контексту, offload и квантованию с живыми метриками.',
  //   tags: ['LLM', 'llama.cpp', 'Benchmark', 'Python'],
  //   year: '2026',
  //   status: 'live',
  //   shot: 'assets/img/projects/modellab.jpg',
  //   clip: 'assets/media/modellab.mp4',
  //   clipWebm: 'assets/media/modellab.webm',
  //   links: { demo: '', repo: '' }
  // }
];
