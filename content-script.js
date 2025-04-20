// フォーム要素を検出する関数
function detectForms() {
  // まず標準的な<form>要素を探す
  const forms = document.querySelectorAll('form');
  if (forms.length > 0) {
    console.log('フォームが検出されました:', forms.length, '件');
    return forms;
  }
  
  // フォームが見つからない場合、入力フィールドの集まりを探す
  // 入力フィールドを集めて仮想的なフォームを作成
  console.log('標準フォームが見つからないため、入力フィールドを探します');
  
  const inputElements = document.querySelectorAll('input, textarea, select');
  if (inputElements.length > 0) {
    console.log('入力フィールドが見つかりました:', inputElements.length, '件');
    
    // 仮想フォーム（div要素）を作成
    const virtualForm = document.createElement('div');
    virtualForm.setAttribute('data-virtual-form', 'true');
    
    // 入力要素の参照を保持（実際にDOM操作はしない）
    virtualForm.inputElements = inputElements;
    
    // 仮想フォーム用のquerySelectorAll関数をオーバーライド
    virtualForm.querySelectorAll = function(selector) {
      if (selector === 'input, textarea, select') {
        return this.inputElements;
      } 
      return [];
    };
    
    return [virtualForm];
  }
  
  console.log('フォームも入力フィールドも見つかりませんでした');
  return [];
}

// 要素が視覚的に見えるかチェック
function isElementVisible(element) {
  const style = window.getComputedStyle(element);
  return style.display !== 'none' && 
         style.visibility !== 'hidden' && 
         style.opacity !== '0';
}

// 要素の位置情報を取得
function getElementPosition(element) {
  const rect = element.getBoundingClientRect();
  return {
    top: rect.top,
    left: rect.left,
    bottom: rect.bottom,
    right: rect.right
  };
}

// OpenAIのAPIを使ってフォームフィールドを解析する関数
async function analyzeFormWithAI(formElement, apiKey, model, formContext = '') {
  // フォーム内の入力要素を取得
  const inputElements = formElement.querySelectorAll('input, textarea, select');
  if (!inputElements || inputElements.length === 0) {
    throw new Error('フォーム内に入力要素が見つかりません');
  }
  
  console.log('入力要素数:', inputElements.length);
  
  const formFields = Array.from(inputElements).map(element => {
    // 基本的なラベル検出
    let label = findLabelForElement(element);
    
    return {
      id: element.id,
      name: element.name,
      type: element.type,
      placeholder: element.placeholder,
      label: label,
      required: element.required
    };
  });

  console.log('解析するフォームフィールド:', formFields);
  
  // 入力可能な要素のみをフィルタリング
  const editableFields = formFields.filter(field => {
    const type = field.type.toLowerCase();
    return type !== 'submit' && type !== 'button' && type !== 'reset' && 
           type !== 'hidden' && type !== 'file' && type !== 'image';
  });
  
  if (editableFields.length === 0) {
    throw new Error('フォーム内に入力可能な要素が見つかりません');
  }

  // OpenAI APIへのリクエスト
  try {
    console.log(`OpenAI API (${model})にリクエストを送信中...`);
    
    const systemMessage = `
あなたはウェブフォームの自動入力を支援するAIアシスタントです。
以下のフォームフィールド情報に基づいて、各フィールドに適切な値を入力してください。
必ず、以下の形式でJSON形式で回答してください:

{
  "フィールドID1": "入力値1",
  "フィールドID2": "入力値2",
  ...
}

注意:
- フィールドIDがない場合は、nameまたはlabelを使用してください
- 実際の値のみを含め、説明やコメントは含めないでください
- 妥当な日本語の値を使用してください（例: 名前なら「山田太郎」など）
- メールアドレスには有効な形式を使用してください（例: user@example.com）
- パスワードには複雑なパスワードを使用してください
- checkboxやradioボタンには "true"/"false" または "1"/"0" で応答してください
`;
    
    let userMessage = `
このウェブフォームに適切な値を入力してください。以下はフォームフィールドの詳細情報です:
${JSON.stringify(editableFields, null, 2)}

各フィールドに適切な値を割り当てたJSONオブジェクトで回答してください。
フィールドIDまたは名前をキーとして使用してください。
`;

    // ユーザーが提供したコンテキスト情報があれば追加
    if (formContext && formContext.trim() !== '') {
      userMessage += `

フォームに関する追加コンテキスト情報:
${formContext}
この情報に基づいて、フォームフィールドに適切な値を入力してください。
`;
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: 'system',
            content: systemMessage
          },
          {
            role: 'user',
            content: userMessage
          }
        ],
        temperature: 0.2,  // より決定論的な結果を得るために低い値を設定
        ...(model.includes('gpt-4') ? {} : { response_format: { type: "json_object" } })  // JSON形式の応答を要求
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      console.error('API応答エラー:', response.status, errorData);
      throw new Error(`APIエラー: ${response.status} - ${errorData?.error?.message || '不明なエラー'}`);
    }

    const data = await response.json();
    console.log('AIレスポンス:', data);
    
    if (data.choices && data.choices.length > 0) {
      const contentResult = parseAIResponse(data.choices[0].message.content, editableFields);
      if (Object.keys(contentResult).length === 0) {
        console.warn('AIレスポンスのパースに失敗しました。レスポンス:', data.choices[0].message.content);
        return null;
      }
      return contentResult;
    } else {
      throw new Error('AIからの有効なレスポンスがありません');
    }
  } catch (error) {
    console.error('AI APIエラー:', error);
    throw error; // 上位の関数でキャッチできるようにエラーを再スロー
  }
}

// AIのレスポンスをパースする関数
function parseAIResponse(responseText, formFields) {
  console.log('AIレスポンスのパース開始:', responseText.substring(0, 100) + '...');
  
  // この関数はAIのレスポンスをパースして、各フォームフィールドの値を返す
  const result = {};
  
  try {
    // ステップ1: JSONとして解析を試みる
    let parsedJson = null;
    
    if (responseText.includes('{') && responseText.includes('}')) {
      try {
        // JSON部分を抽出する試み
        const jsonRegex = /{[\s\S]*?}/g;
        const jsonMatches = responseText.match(jsonRegex);
        
        if (jsonMatches && jsonMatches.length > 0) {
          // 最も長いJSONを試す
          const sortedMatches = [...jsonMatches].sort((a, b) => b.length - a.length);
          
          for (const jsonString of sortedMatches) {
            try {
              parsedJson = JSON.parse(jsonString);
              console.log('JSONとして解析成功:', parsedJson);
              break;
            } catch (e) {
              console.log('JSONパース失敗、次の候補を試します');
            }
          }
        }
      } catch (jsonError) {
        console.log('JSON抽出エラー:', jsonError);
      }
    }
    
    // ステップ2: 解析したJSONから値を抽出
    if (parsedJson) {
      console.log('JSONからフィールド値を抽出します');
      
      for (const field of formFields) {
        const fieldId = field.id || field.name;
        const fieldLabel = field.label ? field.label.toLowerCase() : '';
        
        if (!fieldId && !fieldLabel) continue;
        
        // プロパティを直接検索
        if (fieldId && parsedJson[fieldId] !== undefined) {
          result[fieldId] = parsedJson[fieldId];
          continue;
        }
        
        // ラベルで検索
        if (fieldLabel && parsedJson[fieldLabel] !== undefined) {
          result[fieldId || fieldLabel] = parsedJson[fieldLabel];
          continue;
        }
        
        // プロパティ名の一部一致での検索
        for (const key in parsedJson) {
          const keyLower = key.toLowerCase();
          
          if (fieldId && keyLower.includes(fieldId.toLowerCase())) {
            result[fieldId] = parsedJson[key];
            break;
          }
          if (fieldLabel && keyLower.includes(fieldLabel)) {
            result[fieldId || fieldLabel] = parsedJson[key];
            break;
          }
        }
      }
    }
    
    // ステップ3: 行ごとの解析（JSON解析が失敗した場合、または結果が不十分な場合）
    if (Object.keys(result).length < formFields.length / 2) {
      console.log('行ごとの解析を実行します');
      
      const lines = responseText.split('\n');
      for (const line of lines) {
        if (line.includes(':')) {
          // フォーマット例: "フィールド名: 値" または "フィールドID: 値"
          const parts = line.split(':', 2);
          if (parts.length === 2) {
            const key = parts[0].trim().toLowerCase();
            const value = parts[1].trim();
            
            // 対応するフィールドを検索
            for (const field of formFields) {
              const fieldId = field.id || field.name;
              const fieldLabel = field.label ? field.label.toLowerCase() : '';
              
              if (!fieldId && !fieldLabel) continue;
              
              // 完全一致
              if ((fieldId && key === fieldId.toLowerCase()) || 
                  (fieldLabel && key === fieldLabel)) {
                result[fieldId || fieldLabel] = value;
                break;
              }
              
              // 部分一致
              if ((fieldId && key.includes(fieldId.toLowerCase())) || 
                  (fieldLabel && key.includes(fieldLabel)) ||
                  (fieldId && fieldId.toLowerCase().includes(key)) ||
                  (fieldLabel && fieldLabel.includes(key))) {
                result[fieldId || fieldLabel] = value;
                break;
              }
            }
          }
        }
      }
    }
    
    // ステップ4: プレースホルダーやフィールドタイプに基づく推測
    if (Object.keys(result).length < formFields.length) {
      console.log('デフォルト値の推測を実行します');
      
      for (const field of formFields) {
        const fieldId = field.id || field.name || field.label;
        if (!fieldId || result[fieldId]) continue;
        
        // 既に値が設定されていなければデフォルト値を設定
        if (field.type === 'email') {
          result[fieldId] = 'user@example.com';
        } else if (field.type === 'password') {
          result[fieldId] = 'SecurePassword123!';
        } else if (field.type === 'tel') {
          result[fieldId] = '090-1234-5678';
        } else if (field.type === 'number') {
          result[fieldId] = '123';
        } else if (field.name && field.name.toLowerCase().includes('name')) {
          result[fieldId] = '山田太郎';
        } else if (field.placeholder) {
          // プレースホルダーから推測
          if (field.placeholder.toLowerCase().includes('email')) {
            result[fieldId] = 'user@example.com';
          } else if (field.placeholder.toLowerCase().includes('name')) {
            result[fieldId] = '山田太郎';
          }
        }
      }
    }
    
    console.log('パース結果:', result);
    return result;
  } catch (error) {
    console.error('AIレスポンスのパースエラー:', error);
    // エラーがあっても部分的な結果を返す
    return result;
  }
}

// 要素に関連するラベルを見つける関数
function findLabelForElement(element) {
  // idがある場合、そのidを参照するlabelを探す
  if (element.id) {
    const label = document.querySelector(`label[for="${element.id}"]`);
    if (label) {
      return label.textContent.trim();
    }
  }
  
  // 親要素内のラベルを探す
  const parentElement = element.parentElement;
  if (parentElement) {
    const label = parentElement.querySelector('label');
    if (label) {
      return label.textContent.trim();
    }
  }
  
  return '';
}

// フォームフィールドに値を入力する関数
function fillFormFields(form, fieldValues) {
  const inputElements = form.querySelectorAll('input, textarea, select');
  
  inputElements.forEach(element => {
    const fieldId = element.id || element.name;
    if (fieldId && fieldValues[fieldId]) {
      if (element.type === 'checkbox' || element.type === 'radio') {
        if (fieldValues[fieldId].toLowerCase() === 'true' || 
            fieldValues[fieldId].toLowerCase() === 'yes' ||
            fieldValues[fieldId] === '1') {
          element.checked = true;
        }
      } else {
        element.value = fieldValues[fieldId];
      }
    } else if (!fieldId && element.labels && element.labels.length > 0) {
      // ラベルを使用して値を入力
      const labelText = element.labels[0].textContent.trim();
      if (labelText && fieldValues[labelText]) {
        if (element.type === 'checkbox' || element.type === 'radio') {
          if (fieldValues[labelText].toLowerCase() === 'true' || 
              fieldValues[labelText].toLowerCase() === 'yes' ||
              fieldValues[labelText] === '1') {
            element.checked = true;
          }
        } else {
          element.value = fieldValues[labelText];
        }
      }
    }
  });
}

// グローバルスコープで関数を定義（executeScriptから呼び出せるようにするため）
window.detectForms = detectForms;

// 直接実行用のグローバル関数
window.directExecute = function(action, apiKey, model, options = {}) {
  console.log('directExecuteが呼び出されました:', action, options);
  
  if (action === 'autoFillForms') {
    // フォームコンテキスト情報
    const formContext = options.formContext || '';
    
    // 非同期処理を即時実行関数で実行
    (async () => {
      try {
        // フォーム検出
        console.log('フォーム検出を実行します');
        const forms = detectForms();
          
        if (forms.length === 0) {
          console.error('フォームが見つかりませんでした');
          return { 
            success: false, 
            message: 'ページ内にフォームまたは入力フィールドが見つかりませんでした' 
          };
        }
        
        // 最初のフォームに対して処理を実行
        const fieldValues = await analyzeFormWithAI(forms[0], apiKey, model, formContext);
        if (fieldValues && Object.keys(fieldValues).length > 0) {
          fillFormFields(forms[0], fieldValues);
          return { 
            success: true, 
            message: 'フォームを自動入力しました',
            fields: Object.keys(fieldValues).length
          };
        } else {
          return { 
            success: false, 
            message: 'フォームの解析に失敗しました' 
          };
        }
      } catch (error) {
        console.error('フォーム処理エラー:', error);
        return { 
          success: false, 
          message: `エラー: ${error.message}` 
        };
      }
    })();
      
    return { status: 'processing' };
  }
  
  return { success: false, message: '不明なアクション' };
};

// メイン処理
console.log('content-script が読み込まれました');

// バックグラウンドスクリプトに読み込みを通知
try {
  chrome.runtime.sendMessage({action: 'contentScriptLoaded'}, function(response) {
    console.log('バックグラウンドスクリプトからの応答:', response);
  });
} catch (err) {
  console.error('バックグラウンドスクリプトへの通知エラー:', err);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('メッセージを受信しました:', message);
  
  // バックグラウンドスクリプトにデバッグメッセージを送信
  try {
    chrome.runtime.sendMessage({
      type: 'debug',
      data: { message: 'content-scriptがメッセージを受信', details: message }
    });
  } catch (err) {
    console.error('デバッグメッセージ送信エラー:', err);
  }
  
  if (message.action === 'autoFillForms') {
    const { apiKey, model, formContext } = message;
    
    if (!apiKey) {
      console.error('APIキーがありません');
      sendResponse({ success: false, message: 'APIキーが設定されていません' });
      return true;
    }
    
    // 非同期処理を開始
    (async () => {
      try {
        // フォーム検出
        console.log('フォーム検出を実行します');
        const forms = detectForms();
        
        if (forms.length === 0) {
          console.error('フォームが見つかりませんでした');
          sendResponse({ 
            success: false, 
            message: 'ページ内にフォームまたは入力フィールドが見つかりませんでした' 
          });
          return;
        }
        
        console.log('フォーム解析を開始します');
        
        // 検出された最初のフォームを処理
        const fieldValues = await analyzeFormWithAI(
          forms[0], 
          apiKey, 
          model, 
          formContext
        );
        console.log('解析結果:', fieldValues);
        
        if (fieldValues && Object.keys(fieldValues).length > 0) {
          fillFormFields(forms[0], fieldValues);
          sendResponse({ 
            success: true, 
            message: 'フォームを自動入力しました',
            fields: Object.keys(fieldValues).length
          });
        } else {
          sendResponse({ 
            success: false, 
            message: 'フォームの解析に失敗しました。入力フィールドに適切な値を見つけられませんでした。'
          });
        }
      } catch (error) {
        console.error('フォーム処理エラー:', error);
        
        // エラーメッセージの詳細化
        let errorMsg = error.message;
        if (errorMsg.includes('API')) {
          errorMsg = `OpenAI API エラー: ${errorMsg}`;
        }
        
        sendResponse({ 
          success: false, 
          message: `エラー: ${errorMsg}`
        });
        
        // バックグラウンドスクリプトにエラーを報告
        try {
          chrome.runtime.sendMessage({
            type: 'error',
            error: {
              message: errorMsg,
              stack: error.stack
            }
          });
        } catch (e) {
          console.error('エラー報告中のエラー:', e);
        }
      }
    })();
    
    return true; // 非同期レスポンスのために true を返す
  }
  
  // デフォルトのレスポンス
  sendResponse({ success: false, message: '不明なアクション' });
  return true;
}); 