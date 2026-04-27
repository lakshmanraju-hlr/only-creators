import type { Group } from './supabase'

// Keyword maps per discipline × group slug.
// Each entry: [groupSlug, keywords[]]
// Multi-word phrases score 2 pts (highly specific); single tokens score 1 pt.
type KeywordEntry = [string, string[]]

const KEYWORD_MAPS: Record<string, KeywordEntry[]> = {
  photography: [
    ['portrait',              ['portrait','face','headshot','eyes','skin','gaze','expression','person','closeup','human','character']],
    ['wildlife',              ['wildlife','animal','bird','safari','nature','predator','elephant','lion','fox','deer','fauna','zoo']],
    ['street-photography',   ['street','urban','city','candid','pavement','alley','crowd','pedestrian','grunge','public space']],
    ['fine-art',             ['fine art','gallery','artistic','conceptual','beauty','aesthetic','print','framed','exhibition']],
    ['travel-photography',   ['travel','explore','country','culture','destination','adventure','abroad','world','landscape','journey']],
    ['sports-photography',   ['sports','action','athlete','peak moment','game','match','sprint','jump','freeze','motion blur']],
    ['documentary-photography',['documentary','story','reportage','photojournalism','social','community','real','moment','witness']],
  ],
  music: [
    ['vocals',           ['vocals','singing','voice','vocal','singer','belt','falsetto','melisma','acappella','a cappella','choir']],
    ['string-instruments',['guitar','violin','cello','bass','strings','acoustic','electric','classical guitar','fingerpicking','riff','lick','bow']],
    ['wind-instruments', ['flute','saxophone','trumpet','clarinet','oboe','trombone','horn','woodwind','brass','breath','embouchure']],
    ['music-production', ['production','beat','daw','ableton','logic','fl studio','sample','loop','mixing','mastering','producer']],
    ['live-performance', ['live','stage','concert','gig','show','venue','audience','tour','festival','performance']],
    ['music-theory',     ['theory','harmony','chord','scale','intervals','counterpoint','rhythm','notation','composition','analysis']],
  ],
  dance: [
    ['classical-dance',   ['classical','bharatanatyam','kathak','flamenco','irish dance','ritual','traditional classical','folk classical']],
    ['contemporary-dance',['contemporary','modern dance','floor work','release','somatic','postmodern','contact improv','flow']],
    ['street-dance',      ['hip hop','hiphop','breaking','bboy','bgirl','popping','locking','krump','waacking','street dance','cypher']],
    ['ballet',            ['ballet','pointe','barre','pirouette','arabesque','tutu','corps','ballerina','classical technique']],
    ['folk-dance',        ['folk dance','folk','cultural','african dance','samba','salsa','bachata','latin','traditional','regional']],
    ['choreography',      ['choreography','choreographer','routine','piece','original work','composition','sequence','stage']],
  ],
  art: [
    ['illustration',  ['illustration','illustrator','character','narrative','line art','procreate','tablet','concept art','comic','book']],
    ['oil-painting',  ['oil','canvas','oil painting','brush','impasto','palette','easel','linseed','varnish','realism']],
    ['digital-art',   ['digital','digital painting','photoshop','vector','pixel','concept art','cgi','render','3d art']],
    ['sculpture',     ['sculpture','sculpt','clay','3d','form','relief','casting','carving','installation','tactile','ceramic']],
    ['mixed-media',   ['mixed media','collage','assemblage','found object','texture','layers','experimental','multi-medium']],
    ['street-art',    ['street art','mural','graffiti','spray paint','stencil','paste up','wall','urban art','public']],
  ],
  film: [
    ['cinematography', ['cinematography','shot','frame','lens','bokeh','exposure','lighting','dop','dolly','steadicam','composition']],
    ['film-editing',   ['edit','editing','cut','color grade','color grading','lut','vfx','effects','premiere','davinci','resolve']],
    ['direction',      ['director','directing','vision','mise en scene','scene','blocking','casting','production','creative vision']],
    ['documentary',    ['documentary','non-fiction','interview','verite','real','subject','archive','investigate','expose','truth']],
    ['short-film',     ['short film','narrative','fiction','screenplay','actor','scene','dialogue','character arc','story']],
    ['animation',      ['animation','animated','2d','3d','motion graphics','after effects','render','character animation','rigging']],
  ],
  design: [
    ['graphic-design',  ['graphic design','typography','layout','poster','print','branding','composition','visual','logo','colour']],
    ['motion-design',   ['motion','motion graphics','animation','kinetic','after effects','explainer','title sequence','transition']],
    ['ui-design',       ['ui','ux','interface','wireframe','prototype','figma','product design','user experience','app design']],
    ['interior-design', ['interior','space','room','furniture','decor','architecture','lighting design','spatial','renovation']],
    ['fashion-design',  ['fashion','garment','pattern','textile','sewing','draping','collection','wearable','silhouette']],
    ['brand-identity',  ['brand','identity','logo','brand system','guidelines','mark','visual identity','rebrand','wordmark']],
  ],
  writing: [
    ['fiction',             ['fiction','novel','short story','character','plot','narrative','prose','chapter','story','world building']],
    ['poetry',              ['poem','poetry','verse','spoken word','slam','lyric','stanza','rhyme','metaphor','haiku','sonnet']],
    ['journalism',          ['journalism','report','article','news','investigation','interview','press','byline','feature','breaking']],
    ['screenwriting',       ['script','screenplay','scene','dialogue','act','structure','beat','draft','rewrite','final draft']],
    ['creative-nonfiction', ['essay','memoir','personal essay','nonfiction','narrative nonfiction','creative nonfiction','lyric essay']],
    ['technical-writing',   ['technical','documentation','manual','guide','specification','clarity','instructional','api','readme']],
  ],
  fitness: [
    ['strength-training', ['strength','weightlifting','powerlifting','barbell','squat','deadlift','bench','resistance','gains','PR']],
    ['yoga',              ['yoga','asana','vinyasa','ashtanga','pranayama','meditation','flexibility','mindful','mat','breathwork']],
    ['martial-arts',      ['martial arts','boxing','mma','bjj','karate','judo','muay thai','kickboxing','sparring','belt','combat']],
    ['cardio',            ['cardio','running','cycling','hiit','sprint','endurance','marathon','zone 2','vo2','aerobic']],
    ['sports-rehab',      ['rehab','recovery','physio','physiotherapy','injury','rehab protocol','mobility','pain','return to play']],
    ['nutrition',         ['nutrition','diet','macros','protein','calories','meal prep','fuelling','supplement','eating']],
  ],
  culinary: [
    ['baking',        ['baking','bread','sourdough','loaf','crust','flour','yeast','fermentation','bake','oven','crumb']],
    ['plating',       ['plating','presentation','garnish','plate','fine dining','aesthetic','restaurant','michelin','compose']],
    ['world-cuisine', ['world cuisine','cuisine','regional','culture','global','spice','tradition','street food','authentic']],
    ['fermentation',  ['fermentation','ferment','kimchi','koji','miso','kombucha','sourdough','lacto','culture','probiotic']],
    ['pastry',        ['pastry','cake','confection','chocolate','sugar','patisserie','croissant','tart','macaron','dessert']],
    ['beverage-arts', ['coffee','espresso','cocktail','wine','tea','beverage','barista','sommelier','mixology','brew']],
  ],
  technology: [
    ['web-development', ['web','frontend','backend','fullstack','html','css','javascript','react','node','api','deploy']],
    ['mobile-dev',      ['mobile','ios','android','swift','kotlin','react native','flutter','app','xcode','play store']],
    ['ai-research',     ['ai','machine learning','llm','neural network','model','dataset','training','inference','gpt','research']],
    ['open-source',     ['open source','github','repo','pull request','contribution','community','fork','license','maintainer']],
    ['hardware',        ['hardware','electronics','embedded','arduino','raspberry pi','circuit','pcb','sensor','iot','firmware']],
    ['cybersecurity',   ['security','hacking','ctf','vulnerability','exploit','pentest','infosec','threat','defence','cryptography']],
  ],
  fashion: [
    ['personal-styling',    ['styling','outfit','ootd','look','curate','wardrobe','capsule','personal style','aesthetic','fit']],
    ['tailoring',           ['tailoring','bespoke','sewing','alteration','suit','seam','pattern','fit','handmade','craft']],
    ['accessories',         ['accessories','jewellery','bag','shoes','hat','scarf','belt','watch','handbag','sneakers']],
    ['streetwear',          ['streetwear','hype','drop','sneaker','collab','grail','supreme','off white','urban','fit check']],
    ['sustainable-fashion', ['sustainable','ethical','upcycle','second hand','thrift','vintage','slow fashion','eco','conscious']],
  ],
  sports: [
    ['football',      ['football','soccer','goal','striker','midfield','defend','premier league','champions league','match','kit']],
    ['basketball',    ['basketball','nba','hoop','court','dunk','three pointer','assist','rebound','crossover','fast break']],
    ['cricket',       ['cricket','batting','bowling','wicket','pitch','over','century','test','odi','t20','innings']],
    ['athletics',     ['athletics','track','field','sprint','hurdle','javelin','shot put','relay','100m','long jump']],
    ['swimming',      ['swimming','pool','open water','stroke','lap','freestyle','butterfly','breaststroke','backstroke','race']],
    ['combat-sports', ['boxing','mma','wrestling','judo','bjj','muay thai','kickboxing','fighter','ring','octagon','grapple']],
  ],
}

export function suggestGroup(
  caption: string,
  tags: string[],
  discipline: string,
  availableGroups: Group[]
): Group | null {
  const entries = KEYWORD_MAPS[discipline]
  if (!entries || availableGroups.length === 0) return null

  const normalizedTags = tags.map(t => t.replace(/^#/, '').toLowerCase())
  const corpus = (caption.toLowerCase() + ' ' + normalizedTags.join(' ')).trim()
  if (!corpus) return null

  const tokens = new Set(corpus.split(/\s+/))

  let bestSlug = ''
  let bestScore = 0

  for (const [slug, keywords] of entries) {
    let score = 0
    for (const kw of keywords) {
      if (kw.includes(' ')) {
        if (corpus.includes(kw)) score += 2
      } else {
        if (tokens.has(kw)) score += 1
      }
    }
    if (score > bestScore) {
      bestScore = score
      bestSlug = slug
    }
  }

  if (bestScore === 0) return null
  return availableGroups.find(g => g.slug === bestSlug) ?? null
}
