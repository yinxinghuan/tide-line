// Lightweight i18n. English is the product default (platform serves US/EN
// users); zh/es/pt are switchable fallbacks, never the default.

type Lang = 'en' | 'zh' | 'es' | 'pt';

export function detectLocale(): Lang {
  const o = (typeof localStorage !== 'undefined' && localStorage.getItem('game_locale')) || '';
  if (o === 'en' || o === 'zh' || o === 'es' || o === 'pt') return o;
  const l = (typeof navigator !== 'undefined' ? navigator.language : 'en').toLowerCase();
  if (l.startsWith('zh')) return 'zh';
  if (l.startsWith('es')) return 'es';
  if (l.startsWith('pt')) return 'pt';
  return 'en';
}

let lang: Lang = detectLocale();
export function getLang(): Lang {
  return lang;
}
export function setLang(l: Lang) {
  lang = l;
  try {
    localStorage.setItem('game_locale', l);
  } catch {
    /* ignore */
  }
}

type Vars = { n?: number | string; name?: string; creature?: string };

const DICT: Record<string, [string, string, string, string]> = {
  brand: ['Tide Line', '潮线', 'Tide Line', 'Tide Line'],
  swipeHint: ['Swipe to clear the litter', '滑动清走垃圾', 'Desliza para limpiar', 'Deslize para limpar'],
  restored: ['Shore restored', '海岸已修复', 'Costa restaurada', 'Costa restaurada'],
  piecesCleared: ['{n} pieces of litter cleared', '清走了 {n} 件垃圾', '{n} residuos retirados', '{n} resíduos removidos'],
  wildlifeBack: ['Wildlife is coming back', '生灵正在回归', 'La fauna regresa', 'A vida marinha voltou'],
  seeCoast: ['See the coast', '看看海岸', 'Ver la costa', 'Ver a costa'],
  cleanAnother: ['Clean another stretch', '再清一段', 'Limpiar otra zona', 'Limpar outro trecho'],
  cleanFirst: ['Clean a stretch', '清理海岸', 'Limpiar la costa', 'Limpar a costa'],
  coastTitle: ['The Coast', '共建海岸', 'La Costa', 'A Costa'],
  collectiveLitter: ['pieces of litter cleared', '件垃圾被清走', 'residuos retirados', 'resíduos removidos'],
  beachcombers: ['{n} beachcombers', '{n} 位志愿者', '{n} voluntarios', '{n} voluntários'],
  beachcomber1: ['1 beachcomber', '1 位志愿者', '1 voluntario', '1 voluntário'],
  stretches: ['{n} stretches restored', '{n} 段已修复', '{n} zonas restauradas', '{n} trechos restaurados'],
  stretch1: ['1 stretch restored', '1 段已修复', '1 zona restaurada', '1 trecho restaurado'],
  together: ['Together we cleared', '我们一起清走了', 'Juntos limpiamos', 'Juntos limpamos'],
  topCombers: ['Top beachcombers', '清理榜', 'Mejores voluntarios', 'Top voluntários'],
  you: ['You', '你', 'Tú', 'Você'],
  restoredBy: ['Restored by', '修复者', 'Restaurada por', 'Restaurada por'],
  wildlifeReturned: ['Wildlife that returned', '回归的海洋生灵', 'Fauna que regresó', 'Vida que voltou'],
  releaseTitle: ['Release wildlife here', '放生海洋生物', 'Suelta fauna aquí', 'Solte vida aqui'],
  release: ['Release', '放生', 'Soltar', 'Soltar'],
  addWildlife: ['Add wildlife', '放生生物', 'Soltar fauna', 'Soltar vida'],
  leaderboard: ['Leaderboard', '排行榜', 'Clasificación', 'Ranking'],
  notesN: ['Notes', '留言', 'Notas', 'Notas'],
  released: ['You released a {creature}', '你放生了一只{creature}', 'Soltaste un/a {creature}', 'Você soltou um/a {creature}'],
  noteTitle: ['Leave a note', '留言', 'Deja una nota', 'Deixe uma nota'],
  notePlaceholder: ['Say something kind…', '说点暖心的…', 'Di algo amable…', 'Diga algo gentil…'],
  send: ['Send', '发送', 'Enviar', 'Enviar'],
  noNotes: ['No notes yet — be the first', '还没有留言，来做第一个', 'Sin notas aún', 'Sem notas ainda'],
  emptyCoast: ['No restored stretches yet. Clean the first one!', '还没有修复的海岸，来清第一段！', '¡Limpia la primera zona!', 'Limpe o primeiro trecho!'],
  yourShore: ['Your shore', '你的海岸', 'Tu costa', 'Sua costa'],
  back: ['Back', '返回', 'Atrás', 'Voltar'],
  rescuedN: ['{n} animals freed', '解救了 {n} 只生灵', '{n} animales liberados', '{n} animais libertados'],
  freed: ['Freed!', '获救！', '¡Libre!', 'Livre!'],
  communityGoal: ['COMMUNITY GOAL', '社区共建目标', 'META COMÚN', 'META COMUNITÁRIA'],
  rareGoal: ['Together, bring back the {name}', '齐心让{name}回归', 'Juntos, traer al {name}', 'Juntos, trazer o {name}'],
  allBack: ['All the rare ones are back!', '稀有生灵都回来了！', '¡Todos han vuelto!', 'Todos voltaram!'],
  alreadyBack: ['· {n} back', '· 已回归 {n}', '· {n} de vuelta', '· {n} de volta'],
  toGo: ['{n} more to go', '还差 {n} 件', 'faltan {n}', 'faltam {n}'],
  tapToClean: ['Tap to start cleaning', '点击开始清理', 'Toca para limpiar', 'Toque para limpar'],
  // habitat display names (specimen-plate caption)
  hab_ocean: ['Coast', '海岸', 'Costa', 'Costa'],
  hab_forest: ['Forest', '森林', 'Bosque', 'Floresta'],
  // biome display names (specimen-plate caption)
  bio_tropical: ['Tropical Reef', '热带礁岸', 'Arrecife Tropical', 'Recife Tropical'],
  bio_cove: ['Quiet Cove', '静谧海湾', 'Cala Tranquila', 'Enseada Calma'],
  bio_temperate: ['Temperate Bay', '温带海湾', 'Bahía Templada', 'Baía Temperada'],
  bio_dusk: ['Dusk Lagoon', '暮色潟湖', 'Laguna del Ocaso', 'Lagoa do Crepúsculo'],
  // creature display names
  turtle: ['sea turtle', '海龟', 'tortuga', 'tartaruga'],
  crab: ['crab', '螃蟹', 'cangrejo', 'caranguejo'],
  gull: ['gull', '海鸥', 'gaviota', 'gaivota'],
  starfish: ['starfish', '海星', 'estrella de mar', 'estrela-do-mar'],
  dolphin: ['dolphin', '海豚', 'delfín', 'golfinho'],
  seal: ['seal', '海豹', 'foca', 'foca'],
  shell: ['shell', '贝壳', 'concha', 'concha'],
  whale: ['whale', '鲸鱼', 'ballena', 'baleia'],
  ray: ['manta ray', '蝠鲼', 'mantarraya', 'manta'],
  octopus: ['octopus', '章鱼', 'pulpo', 'polvo'],
  pufferfish: ['pufferfish', '河豚', 'pez globo', 'baiacu'],
  jellyfish: ['jellyfish', '水母', 'medusa', 'água-viva'],
  seahorse: ['seahorse', '海马', 'caballito de mar', 'cavalo-marinho'],
  otter: ['sea otter', '海獭', 'nutria', 'lontra'],
  orca: ['orca', '虎鲸', 'orca', 'orca'],
  fox: ['fox', '狐狸', 'zorro', 'raposa'],
  deer: ['deer', '鹿', 'ciervo', 'veado'],
  owl: ['owl', '猫头鹰', 'búho', 'coruja'],
  hedgehog: ['hedgehog', '刺猬', 'erizo', 'ouriço'],
};

export function t(key: string, vars?: Vars): string {
  const row = DICT[key];
  const idx = lang === 'zh' ? 1 : lang === 'es' ? 2 : lang === 'pt' ? 3 : 0;
  let s = row ? row[idx] : key;
  if (vars) {
    if (vars.n != null) s = s.replace('{n}', String(vars.n));
    if (vars.name != null) s = s.replace('{name}', vars.name);
    if (vars.creature != null) s = s.replace('{creature}', vars.creature);
  }
  return s;
}
