/* 網友預測的後端設定。
 *
 * 留空（null）時網站會以「示範模式」運作：票只存在自己的瀏覽器，其他縣市的票數是模擬資料，
 * 介面會清楚標示「示範資料」。
 *
 * 要讓全台網友的票真的互通，請建立一個免費的 Firebase 專案，把 Web App 設定貼到下面，
 * 並部署 repo 根目錄的 firestore.rules。完整步驟見 README「開啟網友預測」。
 * 這組設定本來就會公開在前端，安全性由 firestore.rules 把關，不是祕密。 */
export const FIREBASE_CONFIG = null;
// 範例：
// export const FIREBASE_CONFIG = {
//   apiKey: 'AIza...',
//   authDomain: 'your-project.firebaseapp.com',
//   projectId: 'your-project',
//   appId: '1:1234567890:web:abcdef',
// };
