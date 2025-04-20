// Chrome拡張機能のインストール/更新時に実行
chrome.runtime.onInstalled.addListener(function() {
  console.log('AI フォーム自動入力拡張機能がインストールされました');
});

// エラーを検出するリスナー
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  if (message.type === 'error') {
    console.error('エラーが報告されました:', message.error);
  }
  
  if (message.type === 'debug') {
    console.log('デバッグメッセージ:', message.data);
  }
  
  // sendResponseが使われる可能性があるので、trueを返す
  return true;
});

// コンテンツスクリプトとの接続確認
chrome.runtime.onConnect.addListener(function(port) {
  console.log('新しい接続:', port.name);
  
  port.onMessage.addListener(function(message) {
    console.log('ポートメッセージ:', message);
  });
  
  port.onDisconnect.addListener(function() {
    console.log('ポート接続が終了しました:', port.name);
  });
});

// コンテンツスクリプトが読み込まれたときのメッセージリスナー
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  if (message.action === 'contentScriptLoaded') {
    console.log('Content Scriptが読み込まれました:', sender.tab ? sender.tab.url : 'unknown');
    // 応答を返す
    sendResponse({status: 'confirmed'});
  }
  
  // 非同期レスポンスのためにtrueを返す
  return true;
}); 