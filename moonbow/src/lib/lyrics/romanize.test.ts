import { describe, expect, it } from 'vitest';
import { canRomanize, romanize } from './romanize';

describe('romanize', () => {
  it('leaves latin text alone', () => {
    expect(canRomanize('hello')).toBe(false);
    expect(romanize('hello')).toBe('hello');
  });
  it('transliterates Cyrillic keeping capitals', () => {
    expect(romanize('Привет, мир')).toBe('Privet, mir');
    expect(romanize('Щука')).toBe('Shchuka');
  });
  it('transliterates Greek', () => {
    expect(romanize('Καλημέρα')).toBe('Kalimera');
  });
  it('romanizes Hangul syllables', () => {
    expect(romanize('사랑해')).toBe('saranghae');
    expect(romanize('안녕 하세요')).toBe('annyeong haseyo');
  });
  it('romanizes kana with yoon, sokuon and long vowels', () => {
    expect(romanize('ありがとう')).toBe('arigatou');
    expect(romanize('きょう')).toBe('kyou');
    expect(romanize('しゃしん')).toBe('shashin');
    expect(romanize('ちょっと')).toBe('chotto');
    expect(romanize('コーヒー')).toBe('koohii');
    expect(romanize('マッチ')).toBe('matchi');
  });
  it('passes kanji through', () => {
    expect(romanize('君の名は')).toBe('君no名ha');
  });
});
