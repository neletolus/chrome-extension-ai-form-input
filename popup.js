document.addEventListener('DOMContentLoaded', function() {
  // DOM要素の取得
  const apiKeyInput = document.getElementById('apiKey');
  const modelSelect = document.getElementById('model');
  const saveSettingsButton = document.getElementById('saveSettingsButton');
  const settingsSavedMessage = document.getElementById('settingsSavedMessage');
  const autoFillButton = document.getElementById('autoFillButton');
  const autoFillMessage = document.getElementById('autoFillMessage');
  
  // 保存されたAPIキー設定を読み込む
  chrome.storage.sync.get(['apiSettings'], function(result) {
    if (result.apiSettings) {
      apiKeyInput.value = result.apiSettings.apiKey || '';
      modelSelect.value = result.apiSettings.model || 'gpt-3.5-turbo';
    }
  });
  
  // APIキー設定保存ボタンのクリックイベント
  saveSettingsButton.addEventListener('click', function() {
    // APIキー設定を取得
    const apiSettings = {
      apiKey: apiKeyInput.value,
      model: modelSelect.value
    };
    
    // データを保存
    chrome.storage.sync.set({apiSettings: apiSettings}, function() {
      // 保存完了メッセージを表示
      settingsSavedMessage.style.display = 'block';
      
      // 3秒後にメッセージを非表示にする
      setTimeout(function() {
        settingsSavedMessage.style.display = 'none';
      }, 3000);
    });
  });
  
  // フォーム自動入力ボタンのクリックイベント
  autoFillButton.addEventListener('click', function() {
    console.log('自動入力ボタンがクリックされました');
    // APIキー設定を取得
    chrome.storage.sync.get(['apiSettings'], function(result) {
      console.log('APIキー設定を取得しました:', result.apiSettings ? 'あり' : 'なし');
      if (!result.apiSettings || !result.apiSettings.apiKey) {
        alert('OpenAI APIキーを設定してください');
        return;
      }
      
      // 現在のタブにメッセージを送信
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        if (!tabs || tabs.length === 0) {
          console.error('アクティブなタブが見つかりません');
          autoFillMessage.textContent = 'エラー: アクティブなタブが見つかりません';
          autoFillMessage.style.color = 'red';
          autoFillMessage.style.display = 'block';
          return;
        }
        
        const activeTab = tabs[0];
        console.log('アクティブなタブ:', activeTab.id);
        
        // 代替アプローチ: 直接フォーム自動入力を実行する
        autoFillMessage.textContent = 'フォーム分析中...';
        autoFillMessage.style.color = 'blue';
        autoFillMessage.style.display = 'block';
        
        // まずcontent-scriptを強制的に挿入
        chrome.tabs.executeScript(
          activeTab.id,
          { file: 'content-script.js' },
          function(injectionResults) {
            if (chrome.runtime.lastError) {
              console.error('スクリプト注入エラー:', chrome.runtime.lastError);
              autoFillMessage.textContent = `エラー: ${chrome.runtime.lastError.message}`;
              autoFillMessage.style.color = 'red';
              autoFillMessage.style.display = 'block';
              return;
            }
            
            console.log('content-scriptを注入または再読み込みしました');
            
            // 少し待ってからメッセージを送信してみる
            setTimeout(function() {
              try {
                chrome.tabs.sendMessage(
                  activeTab.id,
                  {
                    action: 'autoFillForms',
                    apiKey: result.apiSettings.apiKey,
                    model: result.apiSettings.model || 'gpt-3.5-turbo'
                  },
                  function(response) {
                    console.log('content-scriptからのレスポンス:', response);
                    
                    if (chrome.runtime.lastError) {
                      console.warn('メッセージ送信エラー (フォールバック実行を試みます):', chrome.runtime.lastError);
                      
                      // フォールバック: 直接executeScriptで実行
                      executeDirectFill(activeTab.id, result.apiSettings, autoFillMessage);
                      return;
                    }
                    
                    if (response && response.success) {
                      // 成功メッセージを表示
                      autoFillMessage.textContent = response.message;
                      autoFillMessage.style.color = 'green';
                      autoFillMessage.style.display = 'block';
                      
                      // 3秒後にメッセージを非表示にする
                      setTimeout(function() {
                        autoFillMessage.style.display = 'none';
                      }, 3000);
                    } else {
                      // エラーメッセージを表示
                      autoFillMessage.textContent = response ? response.message : 'フォーム自動入力中にエラーが発生しました';
                      autoFillMessage.style.color = 'red';
                      autoFillMessage.style.display = 'block';
                    }
                  }
                );
              } catch (error) {
                console.error('メッセージ送信エラー:', error);
                
                // エラーの場合も直接実行を試みる
                executeDirectFill(activeTab.id, result.apiSettings, autoFillMessage);
              }
            }, 500);
          }
        );
      });
    });
  });
});

// 直接実行関数
function executeDirectFill(tabId, apiSettings, messageElement) {
  console.log('直接実行を試みます');
  
  chrome.tabs.executeScript(
    tabId,
    {
      code: `
        // content-scriptの関数を直接呼び出す
        if (typeof window.directExecute === 'function') {
          console.log('directExecuteを実行します');
          window.directExecute('autoFillForms', '${apiSettings.apiKey}', '${apiSettings.model || 'gpt-3.5-turbo'}', { useAIDetection: true });
        } else if (typeof window.detectForms === 'function') {
          console.log('content-scriptの関数は存在しますが、directExecuteがありません');
          { success: false, message: 'バージョンの不一致: 拡張機能を再読み込みしてください' };
        } else {
          console.error('content-scriptの関数が見つかりません');
          { success: false, message: 'content-scriptが正しく読み込まれていません' };
        }
      `
    },
    function(results) {
      console.log('直接実行結果:', results);
      
      if (chrome.runtime.lastError) {
        console.error('直接実行エラー:', chrome.runtime.lastError);
        messageElement.textContent = `エラー: ${chrome.runtime.lastError.message}`;
        messageElement.style.color = 'red';
        messageElement.style.display = 'block';
        return;
      }
      
      // 直接実行では正確な結果が取得できないため、処理中メッセージを表示
      messageElement.textContent = 'フォーム処理中...完了まで少々お待ちください';
      messageElement.style.color = 'blue';
      
      // 5秒後に完了メッセージを表示（非同期処理なので厳密な完了確認はできない）
      setTimeout(function() {
        messageElement.textContent = 'フォーム処理が完了しました（自動推測）';
        messageElement.style.color = 'green';
        
        // さらに3秒後に非表示
        setTimeout(function() {
          messageElement.style.display = 'none';
        }, 3000);
      }, 5000);
    }
  );
} 