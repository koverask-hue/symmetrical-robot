// Offline romanization for scripts that can be done without a dictionary:
// Cyrillic, Greek, Korean Hangul and Japanese kana. (Chinese characters and
// kanji need a dictionary and are left as-is.)

const CYRILLIC: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', ґ: 'g', д: 'd', е: 'e', ё: 'yo', є: 'ye', ж: 'zh', з: 'z', и: 'i', і: 'i', ї: 'yi', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch',
  ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya', ў: 'w', ђ: 'đ', ј: 'j', љ: 'lj', њ: 'nj', ћ: 'ć', џ: 'dž',
};

const GREEK: Record<string, string> = {
  α: 'a', ά: 'a', β: 'v', γ: 'g', δ: 'd', ε: 'e', έ: 'e', ζ: 'z', η: 'i', ή: 'i', θ: 'th', ι: 'i', ί: 'i', ϊ: 'i', ΐ: 'i',
  κ: 'k', λ: 'l', μ: 'm', ν: 'n', ξ: 'x', ο: 'o', ό: 'o', π: 'p', ρ: 'r', σ: 's', ς: 's', τ: 't', υ: 'y', ύ: 'y', ϋ: 'y',
  ΰ: 'y', φ: 'f', χ: 'ch', ψ: 'ps', ω: 'o', ώ: 'o',
};

// Revised Romanization of Korean, per jamo (without cross-syllable assimilation rules).
const L = ['g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's', 'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h'];
const V = ['a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae', 'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i'];
const T = ['', 'k', 'k', 'k', 'n', 'n', 'n', 't', 'l', 'k', 'm', 'l', 'l', 'l', 'p', 'l', 'm', 'p', 'p', 't', 't', 'ng', 't', 't', 'k', 't', 'p', 't'];

function hangul(ch: string): string | undefined {
  const c = ch.codePointAt(0)! - 0xac00;
  if (c < 0 || c > 11171) return undefined;
  return L[Math.floor(c / 588)] + V[Math.floor((c % 588) / 28)] + T[c % 28];
}

// Hepburn kana. Katakana is mapped onto hiragana first.
const KANA: Record<string, string> = {
  あ: 'a', い: 'i', う: 'u', え: 'e', お: 'o', か: 'ka', き: 'ki', く: 'ku', け: 'ke', こ: 'ko', さ: 'sa', し: 'shi', す: 'su',
  せ: 'se', そ: 'so', た: 'ta', ち: 'chi', つ: 'tsu', て: 'te', と: 'to', な: 'na', に: 'ni', ぬ: 'nu', ね: 'ne', の: 'no',
  は: 'ha', ひ: 'hi', ふ: 'fu', へ: 'he', ほ: 'ho', ま: 'ma', み: 'mi', む: 'mu', め: 'me', も: 'mo', や: 'ya', ゆ: 'yu',
  よ: 'yo', ら: 'ra', り: 'ri', る: 'ru', れ: 're', ろ: 'ro', わ: 'wa', ゐ: 'i', ゑ: 'e', を: 'o', ん: 'n', が: 'ga', ぎ: 'gi',
  ぐ: 'gu', げ: 'ge', ご: 'go', ざ: 'za', じ: 'ji', ず: 'zu', ぜ: 'ze', ぞ: 'zo', だ: 'da', ぢ: 'ji', づ: 'zu', で: 'de',
  ど: 'do', ば: 'ba', び: 'bi', ぶ: 'bu', べ: 'be', ぼ: 'bo', ぱ: 'pa', ぴ: 'pi', ぷ: 'pu', ぺ: 'pe', ぽ: 'po', ゔ: 'vu',
  ぁ: 'a', ぃ: 'i', ぅ: 'u', ぇ: 'e', ぉ: 'o', ゃ: 'ya', ゅ: 'yu', ょ: 'yo', ゎ: 'wa',
};
const YOON: Record<string, string> = { ゃ: 'a', ゅ: 'u', ょ: 'o', ぁ: 'a', ぃ: 'i', ぅ: 'u', ぇ: 'e', ぉ: 'o' };

function kana(text: string): string {
  const s = [...text].map((c) => {
    const code = c.codePointAt(0)!;
    return code >= 0x30a1 && code <= 0x30f6 ? String.fromCodePoint(code - 0x60) : c;
  });
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    const next = s[i + 1];
    if (c === 'っ' && next && KANA[next]) {
      out += KANA[next][0] === 'c' ? 't' : KANA[next][0];
      continue;
    }
    if (c === 'ー') {
      out += out.slice(-1).match(/[aeiou]/) ? out.slice(-1) : '';
      continue;
    }
    const base = KANA[c];
    if (base === undefined) {
      out += c;
      continue;
    }
    if (next && YOON[next] && /[ゃゅょ]/.test(next) && base.length > 1 && base.endsWith('i')) {
      const stem = base.slice(0, -1);
      out += (/(sh|ch|j)$/.test(stem) ? stem : stem + 'y') + YOON[next];
      i++;
      continue;
    }
    if (next && /[ぁぃぅぇぉ]/.test(next) && base.length > 1) {
      out += base.slice(0, -1) + YOON[next];
      i++;
      continue;
    }
    out += base;
  }
  return out;
}

const NEEDS = /[Ͱ-ϿЀ-ӿ぀-ヿ가-힯]/;

export const canRomanize = (s: string) => NEEDS.test(s);

function caseLike(src: string, out: string) {
  return src !== src.toLowerCase() && out ? out[0].toUpperCase() + out.slice(1) : out;
}

export function romanize(s: string): string {
  if (!canRomanize(s)) return s;
  let out = '';
  let kanaRun = '';
  const flush = () => {
    out += kana(kanaRun);
    kanaRun = '';
  };
  for (const ch of s) {
    const code = ch.codePointAt(0)!;
    if ((code >= 0x3040 && code <= 0x30ff) || ch === 'ー') {
      kanaRun += ch;
      continue;
    }
    if (kanaRun) flush();
    const lower = ch.toLowerCase();
    const h = hangul(ch);
    if (h !== undefined) out += h;
    else if (CYRILLIC[lower] !== undefined) out += caseLike(ch, CYRILLIC[lower]);
    else if (GREEK[lower] !== undefined) out += caseLike(ch, GREEK[lower]);
    else out += ch;
  }
  if (kanaRun) flush();
  return out;
}
