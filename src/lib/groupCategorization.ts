import type { Group } from './supabase'

// Keyword maps per discipline × group slug.
// Each entry: [groupSlug, keywords[]]
// Multi-word phrases score 2 pts (highly specific); single tokens score 1 pt.
type KeywordEntry = [string, string[]]

const KEYWORD_MAPS: Record<string, KeywordEntry[]> = {
  photographer: [
    ['wildlife-photography',    ['wildlife','animal','bird','safari','nature','predator','elephant','lion','fox','deer','fauna','zoo']],
    ['portrait-photography',    ['portrait','face','headshot','eyes','skin','gaze','model','expression','person','closeup','human']],
    ['street-photography',      ['street','urban','city','candid','pavement','alley','crowd','pedestrian','grunge','documentary']],
    ['landscape-photography',   ['landscape','mountain','sunset','horizon','valley','field','sky','golden hour','ocean','vista','scenery']],
    ['architecture-photography',['architecture','building','structure','bridge','interior','facade','symmetry','columns','cityscape','skyline']],
    ['bw-photography',          ['blackandwhite','black and white','monochrome','bw','greyscale','grayscale','noir','contrast','shadow','film','analog']],
    ['macro-photography',       ['macro','closeup','close-up','detail','texture','insect','flower','droplet','petal','tiny','extreme']],
    ['astrophotography',        ['astrophotography','milky way','milkyway','stars','galaxy','night sky','nebula','moon','timelapse','astro','cosmos']],
    ['documentary-photography', ['documentary','story','reportage','photojournalism','social','community','real','moment','witness']],
  ],
  singer: [
    ['singer-originals',       ['original','original song','wrote','composed','my song','debut','new track','single','release']],
    ['singer-covers',          ['cover','covering','tribute','version','rendition','remake','interpretation','homage']],
    ['acoustic-sessions',      ['acoustic','unplugged','stripped','guitar','raw','intimate','bedroom session']],
    ['singer-songwriting',     ['lyric','lyrics','melody','hook','bridge','chorus','verse','pen','writing','wrote']],
    ['singer-live',            ['live','stage','concert','gig','performance','show','venue','audience','tour','festival']],
    ['vocal-technique',        ['technique','run','riff','falsetto','belting','melisma','range','scale','warm up','vibrato','exercise']],
    ['singer-collabs',         ['collab','collaboration','feat','feature','duet','together','ft.']],
    ['studio-sessions-singer', ['studio','recording','session','booth','producer','mic','mixing','tracking','take']],
    ['a-cappella',             ['acappella','a cappella','voice only','no instruments','harmony','choir','doo wop','barbershop']],
  ],
  musician: [
    ['guitar',              ['guitar','acoustic guitar','electric guitar','classical guitar','fingerpicking','strumming','chord','riff','solo','lick']],
    ['piano-keys',          ['piano','keyboard','keys','synth','synthesizer','grand piano','upright piano','organ','midi']],
    ['drums-percussion',    ['drums','drum','percussion','beat','groove','snare','kick','hi-hat','rhythm','fill','polyrhythm']],
    ['bass',                ['bass','bass guitar','upright bass','slap','bassline','low end','fretless']],
    ['musician-composition',['composition','compose','original','score','arrangement','orchestrate','theme','motif','piece']],
    ['jazz',                ['jazz','improvisation','standard','bebop','swing','blues','modal','chord changes','ii-v-i','coltrane','miles']],
    ['music-production',    ['production','beat','daw','ableton','logic','fl studio','sample','loop','mixing','mastering','producer']],
    ['classical-music',     ['classical','orchestra','symphony','sonata','concerto','bach','beethoven','mozart','chamber','quartet']],
    ['improvisation',       ['improv','improvise','free jazz','experimental','jam','spontaneous','unscripted','explore']],
  ],
  poet: [
    ['spoken-word',        ['spoken word','spoken','performance poetry','slam','poetry slam','open mic','reading','recite']],
    ['love-poetry',        ['love','heart','romance','longing','desire','miss','yearning','beloved','kiss','tender']],
    ['haiku',              ['haiku','syllable','kigo','season','zen','moment','brevity','japanese','5-7-5']],
    ['political-poetry',   ['political','society','justice','protest','race','freedom','power','resistance','activist','social commentary']],
    ['nature-poetry',      ['nature','tree','river','rain','forest','earth','wind','season','bloom','soil','water']],
    ['experimental-poetry',['experimental','concrete','found poetry','erasure','form','avant garde','fragmented','nonlinear','visual poem']],
    ['prose-poetry',       ['prose','prose poetry','flash fiction','lyric essay','vignette','narrative','story','hybrid']],
    ['grief-healing',      ['grief','loss','death','mourning','healing','trauma','pain','survive','elegy','memory','gone']],
    ['mythology-poetry',   ['myth','mythology','folklore','legend','archetype','gods','hero','odyssey','epic','fable']],
  ],
  'visual-artist': [
    ['digital-art',       ['digital','illustration','procreate','photoshop','digital painting','tablet','vector','pixel','concept art']],
    ['oil-painting',      ['oil','canvas','oil painting','brush','impasto','palette','easel','linseed','varnish']],
    ['watercolor',        ['watercolor','watercolour','wash','transparent','wet on wet','pigment','soft edges','bloom']],
    ['sketch-drawing',    ['sketch','drawing','pencil','ink','charcoal','line art','pen','graphite','gestural','draft']],
    ['sculpture',         ['sculpture','sculpt','clay','3d','form','relief','casting','carving','installation','tactile']],
    ['abstract-art',      ['abstract','non-representational','expressionism','color field','texture','emotion','mark making','gestural']],
    ['character-design',  ['character','character design','creature','oc','original character','concept art','anime','manga','design']],
    ['printmaking',       ['print','printmaking','etching','lithograph','screen print','linocut','woodblock','relief print','intaglio']],
    ['street-art',        ['street art','mural','graffiti','spray paint','stencil','paste up','wall','urban art']],
  ],
  filmmaker: [
    ['short-film',        ['short film','narrative','fiction','screenplay','director','actor','scene','dialogue','character arc']],
    ['documentary-film',  ['documentary','non-fiction','interview','verite','real','subject','archive','investigate','expose','truth']],
    ['cinematography',    ['cinematography','shot','frame','lens','bokeh','exposure','lighting','dop','dolly','steadicam','composition']],
    ['editing-post',      ['edit','editing','cut','color grade','color grading','lut','vfx','effects','premiere','davinci','resolve']],
    ['animation',         ['animation','animated','2d','3d','motion graphics','after effects','render','character animation','rigging']],
    ['music-video',       ['music video','mv','visual','director','choreography','performance','artist','band','shoot']],
    ['experimental-film', ['experimental','avant garde','abstract film','essay film','non-linear','form','deconstructed','video art']],
    ['behind-scenes',     ['behind the scenes','bts','making of','process','set','crew','production diary','breakdown']],
    ['screenwriting',     ['script','screenplay','writing','dialogue','scene','act','structure','beat','draft','rewrite','story']],
  ],
  dancer: [
    ['contemporary-dance',['contemporary','modern dance','floor work','release','somatic','postmodern','contact improv','flow']],
    ['hip-hop-dance',     ['hip hop','hiphop','breaking','bboy','bgirl','popping','locking','krump','waacking','street dance','cypher']],
    ['ballet',            ['ballet','pointe','classical','barre','pirouette','arabesque','tutu','corps','ballerina']],
    ['latin-dance',       ['salsa','bachata','samba','latin','cha cha','merengue','reggaeton','cumbia','partner dance']],
    ['choreography',      ['choreography','choreographer','routine','piece','original work','composition','sequence','stage']],
    ['dance-improvisation',['improv','improvisation','free dance','spontaneous','jam','unscripted','movement research','somatic']],
    ['cultural-dance',    ['folk dance','traditional','cultural','bharatanatyam','flamenco','irish dance','african dance','kathak','ritual']],
    ['dance-fusion',      ['fusion','cross genre','mix','blend','hybrid','experimental dance','afro fusion','bollywood fusion']],
    ['pointe-classical',  ['pointe','en pointe','classical technique','variation','pas de deux','allegro','adagio','grand battement']],
  ],
  comedian: [
    ['stand-up',           ['stand up','standup','set','bit','punchline','joke','comedian','comedy club','open mic','tight five','crowd']],
    ['comedy-sketches',    ['sketch','skit','character','scripted','scene','written','act','comedy sketch']],
    ['improv-comedy',      ['improv','improvised','unscripted','yes and','harold','short form','long form','theater sports','game']],
    ['satire',             ['satire','satirical','parody','commentary','political comedy','current events','news','roast','mock']],
    ['observational-comedy',['observational','everyday','relatable','life','mundane','ordinary','notice','truth','slice of life']],
    ['dark-humor',         ['dark','dark humor','dark comedy','taboo','edgy','morbid','controversial','offensive','shock']],
    ['character-comedy',   ['character','impression','persona','voice','character work','alter ego','imitation','caricature']],
    ['written-jokes',      ['tweet','one liner','pun','wordplay','written','joke','wit','dry humor','caption humor']],
    ['physical-comedy',    ['physical','slapstick','physical comedy','pratfall','mime','clown','prop','body','timing','fall']],
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
