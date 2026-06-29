#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ניקוי אוטומטי לקובץ כתוביות (SRT) בעברית.
מבצע את כל התיקונים המכניים שאפשר לעשות בלי שיקול דעת אנושי:

  1. הסרת ניקוד (בְּסֵדֶר -> בסדר)
  2. הסרת תווי נגינה ♪ ♫ (השורות עצמן נשארות, רק התווים יורדים)
  3. הסרת שאריות אנגלית בתחילת שורה (Th-Th-, D-, Y-, וכו')
  4. "יאללה" -> "קדימה"
  5. "חרא" -> "לעזאזל"

מה שהסקריפט *לא* עושה: זכר/נקבה ושכתוב ניסוחים — זה דורש שיקול דעת
לפי מי מדבר אל מי, ואת זה עוברים ידנית סצנה-סצנה.

הרצה:
    python3 clean_subtitles.py  input.he.srt  output.he.srt
"""

import sys
import re


def remove_niqqud(text: str) -> str:
    # טווח סימני הניקוד והטעמים בעברית
    return re.sub(r'[֑-ׇ]', '', text)


def remove_music_notes(text: str) -> str:
    # מורידים תווי נגינה ורווחים מיותרים שנשארים סביבם
    text = text.replace('♪', '').replace('♫', '')
    return re.sub(r'[ \t]{2,}', ' ', text).strip()


def strip_latin_stutter(text: str) -> str:
    # שאריות תעתיק כמו "Th-Th-", "D-", "Y-", "i " בתחילת שורה
    text = re.sub(r'^[A-Za-z]{1,2}-(?:[A-Za-z]{1,2}-)*', '', text)
    text = re.sub(r'^i\s+', '', text)
    return text


def fix_words(text: str) -> str:
    text = text.replace('יאללה', 'קדימה')
    text = text.replace('חרא', 'לעזאזל')
    return text


def clean_line(line: str) -> str:
    line = remove_niqqud(line)
    line = remove_music_notes(line)
    line = strip_latin_stutter(line)
    line = fix_words(line)
    return line


def is_timecode(line: str) -> bool:
    return '-->' in line


def is_index(line: str) -> bool:
    return line.strip().isdigit()


def main():
    if len(sys.argv) != 3:
        print('שימוש: python3 clean_subtitles.py input.srt output.srt')
        sys.exit(1)

    src, dst = sys.argv[1], sys.argv[2]
    out = []
    with open(src, encoding='utf-8-sig') as f:
        for raw in f:
            line = raw.rstrip('\n')
            # שורות אינדקס וטיימקוד נשארות כפי שהן — לא נוגעים בתזמון
            if is_index(line) or is_timecode(line) or line.strip() == '':
                out.append(line)
            else:
                out.append(clean_line(line))

    with open(dst, 'w', encoding='utf-8') as f:
        f.write('\n'.join(out))

    print(f'הקובץ הנקי נשמר ב: {dst}')


if __name__ == '__main__':
    main()
