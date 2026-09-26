/* ============================================================================
   КОНТЕНТ САЙТА. Правится только этот файл — вёрстку трогать не нужно.
   ----------------------------------------------------------------------------
   Карточка проекта:
     title    — название
     kind     — тип: 'AI-продукт' | 'Игра' | 'Сайт' | 'Расширение' | 'Инструмент'
     desc     — 1–3 строки описания
     tags     — массив строк; выводятся чипами на карточке
     year     — год или период
     status   — 'live' | 'wip' | 'archived'; 'live' бейджа не получает — это
                нормальное состояние, значок нужен только для wip/archived
     shot     — превью, путь от корня сайта
     shotPos  — необязательно: куда сдвинуть кадр внутри карточки, если он шире
                пропорции 16:10. Значение как у object-position, например '70% 50%':
                0% — показывать левый край, 100% — правый. По умолчанию центр.
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
                web       — второй канал рядом с demo, подписывается «Веб-версия»
   ============================================================================ */

window.SITE = {
  name: 'Дмитрий О.',
  role: 'AI-Native Developer / Full-Stack AI Engineer',
  tagline: 'AI-продукты полного цикла: исследование моделей, прототип, backend, деплой. Отдельно - свои игры на Godot и three.js.',
  location: 'Санкт-Петербург',

  hh: 'https://hh.ru/resume/d887856aff0eea819f0039ed1f574e52717661',
  // PDF-резюме нет: удалено и из шапки, и из контактов. Осталось только HH.
  cv: '',
  telegram: 'https://t.me/citystas',
  // Адрес без схемы: mailto: собирается при рендере контактов.
  email: 'sekadist@gmail.com',
  github: 'https://github.com/CityStas/',

  about: [
    'AI-Native Developer / Full-Stack AI Engineer с опытом разработки AI-продуктов полного цикла - от исследования моделей и прототипирования до backend, интеграции и deployment. Специализируюсь на AI-driven development, проектировании AI-workflows и агентных систем, prompt engineering и evaluation моделей. Использую AI как часть инженерного процесса: автоматизирую разработку, тестирую и сравниваю модели, оптимизирую качество, скорость и затраты.',
    'Увлекаюсь геймдевом, разрабатываю собственные игровые проекты на Godot и Three.js с использованием AI-инструментов. Люблю видеоигры, особенно FPS. Готов активно развиваться в геймдеве, осваивать новые технологии и применять свой опыт AI-разработки для создания игровых продуктов.'
  ],

  facts: [
    ['Опыт', '2+ года в разработке и инфраструктуре'],
    ['Полный цикл', 'research → prototype → backend → deploy'],
    ['Фокус', 'Prompt engineering · Evaluation · AI-агенты'],
    ['Формат', 'Удалённо · готов к командировкам']
  ],

  stack: [
    { group: 'AI / LLM', items: ['llama.cpp', 'Ollama', 'Bionic', 'Unsloth', 'ComfyUI', 'ControlNet'] },
    { group: 'Агенты и RAG', items: ['MCP', 'n8n', 'Tool Calling', 'RAG', 'Vector search'] },
    { group: 'Промпты и eval', items: ['Prompt engineering', 'Model Evaluation', 'Benchmarking', 'AIDD'] },
    { group: 'Backend', items: ['Python', 'FastAPI', 'NestJS', 'aiogram 3', 'MongoDB', 'PHP'] },
    { group: 'Фронтенд и мобильное', items: ['Next.js', 'React', 'Tailwind', 'three.js', 'WebGL', 'Capacitor'] },
    { group: 'DevOps', items: ['Docker', 'Nginx', 'Linux', 'GitHub Actions', 'Prometheus', 'Grafana'] }
  ]
};

window.PROJECTS = [
  {
    title: 'Shrooms 2D',
    kind: 'Игра',
    desc: '2D-платформер на Godot 4: игрок, подбор предметов, враги, уровни. Оптимизирован под работу в браузере.',
    tags: ['Godot 4', 'GDScript', '2D', 'Web'],
    year: '2026',
    status: 'live',
    shot: 'assets/img/projects/shrooms.jpg',
    links: { demo: 'https://deddemo.vercel.app/', demoLabel: 'Demo', demoEmbed: true, repo: '' }
  },
  {
    title: 'Bubble Peaks 3D',
    kind: 'Игра',
    desc: 'Трёхмерный уровень на Godot 4 с Forward+ рендером: свет, материалы, рельеф. Оптимизирован под работу в браузере.',
    tags: ['Godot 4', '3D', 'Forward+', 'Web'],
    year: '2026',
    status: 'live',
    shot: 'assets/img/projects/bubblepeaks.jpg',
    links: { demo: 'https://bubblepeaks.vercel.app/', demoLabel: 'Demo', demoEmbed: true, repo: '' }
  },
  {
    title: 'LILCRAFT 3D',
    kind: 'Игра',
    desc: 'Воксельная песочница в браузере на three.js: генерация чанков, меш-оптимизация, сохранение мира + "пасхалка".',
    tags: ['three.js', 'WebGL', 'Voxel', 'Web'],
    year: '2025-2026',
    status: 'live',
    shot: 'assets/img/projects/lilcraft.jpg',
    links: { demo: 'https://lilcraft.vercel.app/', demoLabel: 'Demo', demoEmbed: true, repo: '' }
  },
  {
    title: 'БАЗА Скейтборды',
    kind: 'Сайт',
    desc: 'Витрина магазина скейтбордов: переадресация в бизнес-профиль Авито.',
    tags: ['HTML/CSS', 'JavaScript', 'GitHub Pages'],
    year: '2025-2026',
    status: 'live',
    shot: 'assets/img/projects/bazaskate.jpg',
    links: { demo: 'https://bazaskate.shop/', repo: '' }
  },
  {
    title: 'Dubbed',
    kind: 'Расширение',
    desc: 'Расширение для Chrome/Firefox: переводит и озвучивает видео прямо на странице сайта.',
    tags: ['JavaScript', 'MV3', 'TTS'],
    year: '2025-2026',
    status: 'live',
    shot: 'assets/img/projects/dubbed.jpg',
    links: { demo: 'https://dubbedru.vercel.app/', repo: '' }
  },

  // Превью - страница RuStore: это основной канал, сайт подписан как веб-версия.
  {
    title: 'ORFree AI / ОРФ ИИ',
    kind: 'AI-продукт',
    desc: 'AI-чат-ассистент для Android и Web. Свой алгоритм динамического выбора моделей через OpenRouter: специфика запроса, доступность, latency. Приложение разработано с использованием Capacitor и опубликовано в RuStore. Реализована отдельная локальная сборка со встроенной LLM для офлайн-работы на Android.',
    tags: ['LLM', 'OpenRouter', 'Capacitor', 'Android'],
    year: '2025-2026',
    status: 'live',
    shot: 'assets/img/projects/rustore.jpg',
    links: {
      demo: 'https://www.rustore.ru/catalog/app/com.orfree.app',
      demoLabel: 'RuStore',
      demoIcon: 'store',
      web: 'https://orfreeweb.vercel.app/',
      tg: 'https://t.me/stas1620_bot',
      tgLabel: 'Telegram-бот',
      repo: ''
    }
  }
];
