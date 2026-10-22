# 颱風假機率計算器＆網友預測 🌀

🔗 **網站：[https://typhoon.sectools.tw/](https://typhoon.sectools.tw/)**

純前端靜態網站（GitHub Pages 即可部署）。輸入中央氣象署預報的風力、陣風、雨量估算隔天放颱風假的機率，再和全台網友一起猜猜看，縣市公告後對答案。娛樂參考用，正式結果一律以行政院人事行政總處及各縣市政府公告為準。

## 功能

### 機率估算
- 依《天然災害停止上班及上課作業辦法》第 4 條的風力／雨量門檻計算基礎機率，再乘上縣市歷史傾向係數
- 圓環儀表顯示結果，附法規檢核清單；日期預設為明天（台灣時間）
- 「📍 定位」自動選縣市；選過的縣市、深淺色主題都會記住

### 網友預測（新）
- **預測**：每人每天替一個縣市猜一次（會放假／照常上班），可預測明天或後天，送出後不能改
- **看統計**：送出後解鎖「全台網友預測看板」（台灣方格地圖），翻牌＋數字跳動動畫，人數即時更新；沒預測的人只看得到參與人數。D-1 日 19:00 截止後所有人都能看
- **對答案**：管理者填入官方公告後，看板標上「休／班」，詳情卡顯示「官方結果＋資料來源（人事行政總處）」；猜中會有彩帶與通知
- **預言家戰績**：依猜中率給稱號（見習觀測員 → 菜鳥觀測員 → 颱風觀察員 → 資深氣象迷 → 颱風假預言家）
- 「模型估算 vs 網友預測 vs 近 10 年放假率」三方對照、最看好放假縣市排行榜、分享我的預測
- 防灌票：Firebase 匿名登入＋Firestore 安全規則（一人一天一次、計數只能 +1 且必須和預測紀錄同時寫入、只在預測時段內可送出）

### 其他
- 響應式設計（桌機雙欄、手機單欄且預測面板優先），淺色／深色模式，尊重「減少動態效果」設定
- SEO：meta、Open Graph、canonical、JSON-LD（WebApplication＋FAQPage）、sitemap、robots
- PWA：可加到主畫面；頁面與程式碼走網路優先，離線時退回快取
- Facebook／Threads／LINE 分享、複製連結；手機上「分享我的預測」使用系統分享面板
- 隱私權政策頁（`privacy.html`），符合 AdSense 要求

## 檔案結構

| 檔案 | 說明 |
| --- | --- |
| `index.html` | 頁面結構、SEO 標記 |
| `assets/css/style.css` | 全站樣式（設計 token 在最上面） |
| `assets/js/app.js` | 縣市資料、估算模型、計算器互動，透過 `window.Typhoon` 給網友預測共用 |
| `assets/js/vote.js` | 網友預測：Firebase／示範模式後端、預測看板、揭曉、戰績 |
| `assets/js/config.js` | Firebase 設定（留空＝示範模式） |
| `firestore.rules` | Firestore 安全規則 |
| `privacy.html` | 隱私權政策 |
| `sw.js` / `manifest.json` | PWA |

## 開啟網友預測（Firebase，約 10 分鐘）

`assets/js/config.js` 留空時，網友預測以**示範模式**運作：介面右上角標示「示範資料・模擬票數」，其他縣市的票數是模擬的，你的票只存在自己的瀏覽器。要讓全台網友的票互通：

1. 到 [Firebase 主控台](https://console.firebase.google.com/) 建立專案（免費 Spark 方案即可）。
2. **Build → Authentication → Sign-in method**：啟用「匿名（Anonymous）」。
3. **Build → Firestore Database**：建立資料庫（地區建議 `asia-east1` 台灣）。
4. **Firestore → 規則**：把 repo 裡 `firestore.rules` 的內容整個貼上並發布（或用 `firebase deploy --only firestore:rules`）。
5. **專案設定 → 一般 → 你的應用程式**：新增 Web App，把 `firebaseConfig` 貼到 `assets/js/config.js`：
   ```js
   export const FIREBASE_CONFIG = {
     apiKey: 'AIza...',
     authDomain: 'your-project.firebaseapp.com',
     projectId: 'your-project',
     appId: '1:1234567890:web:abcdef',
   };
   ```
   這組設定本來就會公開在前端，不是祕密，安全性由 `firestore.rules` 把關。
6. **Authentication → 設定 → 授權網域**：加入 `typhoon.sectools.tw`。
7. 推上 GitHub，右上角變成「● 即時連線」就完成了。

### 公告後填入官方結果

在 Firestore 主控台新增文件 `results/{日期}`（例如 `results/2026-10-23`），欄位用縣市代碼、值為：

| 值 | 意思 | 算「會放假」嗎 |
| --- | --- | --- |
| `off` | 停止上班上課 | ✅ |
| `partial` | 部分區域／半天停班停課 | ✅ |
| `on` | 照常上班上課 | ❌ |

可以陸續公告陸續加欄位，網頁會即時標上官方結果。只要填了任何一個縣市，該日就會切換成「已有官方公告」並停止投票。

縣市代碼：`TPE` 台北、`NWT` 新北、`KEE` 基隆、`TAO` 桃園、`HSZ` 新竹市、`HSQ` 新竹縣、`MIA` 苗栗、`TXG` 台中、`CHA` 彰化、`NAN` 南投、`YUN` 雲林、`CYI` 嘉義市、`CYQ` 嘉義縣、`TNN` 台南、`KHH` 高雄、`PIF` 屏東、`ILA` 宜蘭、`HUA` 花蓮、`TTT` 台東、`PEN` 澎湖、`KIN` 金門、`LIE` 連江。

### 預測時間與資料結構

- 預測 D 日：D-2 日 00:00 開放，**D-1 日 19:00（台灣時間）截止**，之後停止預測、等待公告。時間定義在 `vote.js` 的 `pollTimes()` 與 `firestore.rules` 的 `votingOpen()`，兩邊要一起改。
- `days/{date}`：計票，欄位如 `TPE_yes`、`TPE_no`，公開可讀，整頁只要訂閱這一份文件，讀取量很低。
- `days/{date}/votes/{uid}`：個別預測紀錄，只有本人能讀。
- 已知限制：清除瀏覽器資料會拿到新的匿名身分而能再投一次。流量變大時建議開啟 [Firebase App Check](https://firebase.google.com/docs/app-check)（reCAPTCHA Enterprise）擋機器人。

### 本機測試規則

`config.js` 可加上 `emulator: { host: '127.0.0.1', authPort: 9099, firestorePort: 8080 }` 連本機模擬器：

```bash
npx firebase-tools emulators:start --only firestore,auth --project demo-typhoon
```

## 法律注意事項（台灣）

> 以下是設計時參考的法規與對應做法，**不是法律意見**；正式營運或有商業合作前，建議請律師確認。

| 風險 | 相關法規 | 本站做法 |
| --- | --- | --- |
| 預測畫面被截圖當成停班停課消息轉傳 | 《災害防救法》禁止散播有關災害之謠言或不實訊息；《社會秩序維護法》第 63 條散布謠言 | 全站稱「網友預測」並標「非官方公告」；預測區最上方有醒目提醒；看板內建「非政府公告」浮水印列（截圖會一起帶到）；分享文字自動附上「網友預測，非官方公告」；官方結果一律標示資料來源並連到人事行政總處 |
| 被誤認為氣象預報 | 《氣象法》：非經許可不得發布氣象預報 | 本站不產生天氣預報，風雨數值由使用者依中央氣象署預報自行輸入；首頁颱風圖標示「裝飾示意圖・非氣象資料」，不畫預報路徑 |
| 被當成選舉投票／民調 | 選舉罷免相關法規對選舉民調的限制 | 不使用「開票、投票所」等選舉用語與新聞台 LIVE 樣式，主題與任何選舉、政黨無關，配色也避開政黨代表色 |
| 變成賭博或有獎活動 | 《刑法》賭博罪、有獎活動相關規範 | 沒有金錢、點數、獎品，戰績只是稱號。**之後若要加獎品或抽獎，請先確認活動辦法與法規** |
| 個人資料 | 《個人資料保護法》 | 不需註冊，只用匿名識別碼防重複，不收姓名、Email、座標（見 `privacy.html`） |

## 資料來源與係數計算方式

| 項目 | 來源 | 說明 |
| --- | --- | --- |
| 風力／雨量門檻 | [天然災害停止上班及上課作業辦法](https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=S0110022) 第 4 條 | 平均風力 7 級以上或陣風 10 級以上；累積雨量達平地 350mm／山區 200mm 且已致災或有致災之虞 |
| 縣市歷史傾向係數 | [近 10 年各縣市颱風假機率統計](https://ibuyranking.blogspot.com/2024/10/typhoon-day.html)（第三方部落格彙整公開停班公告紀錄，非官方數據） | 取各縣市「近10年颱風假機率」欄位，除以 22 縣市平均值，得出相對係數（例如屏東 87.5% ÷ 全國均值 55.0% ≈ 1.65 倍） |

法規門檻是「是否會停班停課」的判斷依據；縣市係數只是反映「同樣風雨條件下，這個縣市過去比較常/比較少宣布」的歷史傾向，兩者結合起來還是一個粗估，不是官方預測模型。

## 免責聲明

本工具僅供參考娛樂，不構成任何官方停班停課保證。是否放假請以中央氣象署預報及各縣市政府正式公告為準，公告通常於前一日晚間 7 時至 10 時前發布。

定位功能只在使用者主動按下按鈕時才會呼叫瀏覽器定位 API，座標僅傳送給 OpenStreetMap 的 Nominatim 反向地理編碼服務用來換成縣市名稱，本工具不會儲存座標，也不會傳送到其他地方。Nominatim 是免費公用服務，有基本流量限制（約每秒 1 次請求），一般個人使用沒問題；若之後流量變大，建議换成 Google Maps Geocoding API 之類的付費服務並用自己的 API Key。

## 部署

GitHub Pages：repo 的 Settings → Pages → Source 選 `main` branch、`/ (root)`。自訂網域由 `CNAME` 設定（`typhoon.sectools.tw`）。

## 之後想改

- 縣市係數：`assets/js/app.js` 裡的 `COUNTIES` 陣列（`row`／`col` 是預測看板方格地圖的位置）。
- 估算邏輯：`app.js` 的 `estimate()`。
- 改版後如果有新增檔案，記得把路徑加進 `sw.js` 的 `APP_SHELL` 並調高 `CACHE_NAME` 版本。
