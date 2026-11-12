"""每天更新網站上的「明天」日期，讓搜尋「11/13 颱風假」這類關鍵字有機會找到本站。

颱風季（5～11 月）把標題、描述、首頁日期換成台灣時間的明天；其他月份恢復通用文字。
由 .github/workflows/daily-date.yml 每天台灣時間 00:05 執行，也可以手動跑：
    python3 scripts/update_date.py            # 依今天日期
    python3 scripts/update_date.py 2026-11-12 # 指定「今天」（測試用）
"""
import datetime
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
TYPHOON_MONTHS = range(5, 12)  # 5～11 月
WEEKDAYS = '一二三四五六日'


def today_tw():
    if len(sys.argv) > 1:
        return datetime.date.fromisoformat(sys.argv[1])
    return (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=8)).date()


def texts(tomorrow):
    """回傳要寫進頁面的文字；非颱風季回傳不含日期的通用版本。"""
    if tomorrow.month not in TYPHOON_MONTHS:
        return {
            'title': '颱風假機率計算器｜明天會放颱風假嗎？',
            'description': '明天會放颱風假嗎？依《天然災害停止上班及上課作業辦法》門檻與近10年各縣市停班紀錄估算放假機率。輸入氣象署風雨預報即可試算，支援定位自動選縣市。',
            'social': '明天會放颱風假嗎？颱風假機率計算器',
            'hero': '明天',
        }
    md = f'{tomorrow.month}/{tomorrow.day}'
    label = f'{md}（{WEEKDAYS[tomorrow.weekday()]}）'
    return {
        'title': f'{md} 颱風假？明天會放颱風假嗎｜颱風假機率計算器',
        'description': f'{label}會放颱風假嗎？依《天然災害停止上班及上課作業辦法》門檻與各縣市近10年停班紀錄，輸入氣象署風雨預報就能估算 {md} 放假機率，官方結果以人事行政總處公告為準。',
        'social': f'{md} 颱風假？明天會放颱風假嗎｜颱風假機率計算器',
        'hero': label,
    }


def sub(pattern, repl, text):
    new, n = re.subn(pattern, repl, text, count=1)
    if n != 1:
        raise SystemExit(f'找不到要更新的位置：{pattern}')
    return new


def main():
    today = today_tw()
    t = texts(today + datetime.timedelta(days=1))

    index = ROOT / 'index.html'
    html = index.read_text(encoding='utf-8')
    html = sub(r'<title>[^<]*</title>', f'<title>{t["title"]}</title>', html)
    html = sub(r'(<meta name="description" content=")[^"]*(">)', rf'\g<1>{t["description"]}\g<2>', html)
    html = sub(r'(<meta property="og:title" content=")[^"]*(">)', rf'\g<1>{t["social"]}\g<2>', html)
    html = sub(r'(<meta name="twitter:title" content=")[^"]*(">)', rf'\g<1>{t["social"]}\g<2>', html)
    html = sub(r'(<span id="heroDate">)[^<]*(</span>)', rf'\g<1>{t["hero"]}\g<2>', html)
    html = sub(r'("dateModified": ")[^"]*(")', rf'\g<1>{today.isoformat()}\g<2>', html)
    index.write_text(html, encoding='utf-8')

    sitemap = ROOT / 'sitemap.xml'
    xml = sitemap.read_text(encoding='utf-8')
    xml = sub(r'(<loc>https://typhoon\.sectools\.tw/</loc>\s*<lastmod>)[^<]*(</lastmod>)', rf'\g<1>{today.isoformat()}\g<2>', xml)
    sitemap.write_text(xml, encoding='utf-8')

    print(f'{today} → {t["title"]}')


if __name__ == '__main__':
    main()
