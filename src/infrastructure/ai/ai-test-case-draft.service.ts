import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface AiGeneratedTestCase {
  title: string;
  description: string;
  preconditions: string[];
  expectedResult: string;
  priority: string;
  suggestedTestLevel: string;
  reusabilityNote: string | null;
  unitTestRecommended: boolean;
}

@Injectable()
export class AiTestCaseDraftService {
  private readonly logger = new Logger(AiTestCaseDraftService.name);

  constructor(private readonly config: ConfigService) {}

  async generateFromRequirementSection(content: string, documentContext?: string): Promise<AiGeneratedTestCase[]> {
    const apiKey = this.config.get<string>('MINIMAX_API_KEY');
    const apiUrl = this.config.get<string>('MINIMAX_API_URL', 'https://api.minimaxi.com/v1/text/chatcompletion_v2');
    const model = this.config.get<string>('MINIMAX_MODEL', 'MiniMax-M2.7');
    const timeoutMs = this.config.get<number>('MINIMAX_TIMEOUT_MS', 15000);

    if (!apiKey) return this.buildFallbackDrafts(content, documentContext);

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: this.buildPrompt(content, documentContext) }],
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        this.logger.warn(`MiniMax API returned ${response.status}: ${body.slice(0, 500)}`);
        return this.buildFallbackDrafts(content, documentContext);
      }

      const payload = (await response.json()) as unknown;
      const assistantText = this.extractAssistantText(payload);
      const parsed = this.parseJsonLikeTestCases(assistantText);
      return parsed.length > 0 ? parsed : this.buildFallbackDrafts(content, documentContext);
    } catch (error) {
      this.logger.warn(`MiniMax API call failed: ${error instanceof Error ? error.message : String(error)}`);
      return this.buildFallbackDrafts(content, documentContext);
    }
  }

  private buildPrompt(content: string, documentContext?: string): string {
    return `
你是一名資深軟體測試工程師，正在協助 QA/PM 把 Markdown 產品需求轉成可人工審核的測試案例草稿。

請只根據需求產生測試案例，不要補入需求沒有提到的產品功能。每個案例都要像正式 test_case_versions 資料列，可直接存入資料庫並顯示在測試案例編輯器。

整份需求上下文：
${documentContext?.trim() || content}

本次要產生測試案例的 section：
${content}

產出規則：
1. 針對本 section 的主要功能點產生 2 到 5 筆測試案例。
2. 每筆案例必須聚焦不同驗證重點，例如正常加總、空資料、資料型別、明確排除價格計算、邊界值等；不要只把「正常流程 / 例外流程」換字重複。
3. title 要具體描述驗證目標，例如「計算多個商品的總數量」或「購物車沒有商品時回傳 0」。
4. description 是 DB 欄位 description，必須是一句完整的測試描述，例如「確認多個商品的 quantity 可以正確加總。」。
5. description 禁止包含 Type、positive、negative、Steps、步驟、Markdown、編號清單。
6. preconditions 是 DB 欄位 preconditions，必須放入可執行測試所需的具體資料狀態。若需求有範例資料，請保留那些具體資料，例如「購物車包含商品 A quantity = 2、商品 B quantity = 3、商品 C quantity = 1」。
7. preconditions 只描述前置資料或角色狀態，不要放操作步驟，不要只寫「需求內容已建立」這種空泛句子。
8. expectedResult 是 DB 欄位 expected_result，必須寫出明確、可驗證的結果。若需求有數字範例，請寫出精確值，例如「回傳總商品數量為 6」。
7. priority 只能是 p0、p1、p2、p3；核心阻斷情境用 p0/p1，一般邊界用 p2，低風險用 p3。
8. suggestedTestLevel 只能是 unit、integration、e2e。純輸入驗證、格式轉換、權限判斷優先用 unit；跨 API/DB 流程用 integration；完整使用者流程才用 e2e。
9. reusabilityNote 請用英文工程說明，風格類似 "Markdown upload orchestration should be covered with integration tests."；沒有可重用價值時回傳 null。
10. unitTestRecommended 必須是 boolean。

好的輸出範例：
{
  "title": "計算多個商品的總數量",
  "description": "確認購物車包含多個商品時，每個商品的 quantity 可以正確加總。",
  "preconditions": ["購物車包含商品 A quantity = 2、商品 B quantity = 3、商品 C quantity = 1。"],
  "expectedResult": "回傳總商品數量為 6。",
  "priority": "p1",
  "suggestedTestLevel": "unit",
  "reusabilityNote": "Cart quantity aggregation should be covered with unit tests.",
  "unitTestRecommended": true
}

請嚴格只回傳以下 JSON，不要加入 Markdown，不要加入解釋文字：
{
  "testCases": [
    {
      "title": "測試案例名稱",
      "description": "測試案例描述",
      "preconditions": ["前置條件"],
      "expectedResult": "預期結果",
      "priority": "p0",
      "suggestedTestLevel": "unit",
      "reusabilityNote": "Validation boundary rules should be covered with unit tests.",
      "unitTestRecommended": true
    }
  ]
}
`.trim();
  }

  private extractAssistantText(payload: unknown): string {
    if (typeof payload === 'string') return payload;
    if (!payload || typeof payload !== 'object') return '';

    const record = payload as Record<string, unknown>;
    const choices = record.choices;
    if (Array.isArray(choices)) {
      const firstChoice = choices[0] as Record<string, unknown> | undefined;
      const message = firstChoice?.message as Record<string, unknown> | undefined;
      if (typeof message?.content === 'string') return message.content;
      if (typeof firstChoice?.text === 'string') return firstChoice.text;
    }

    if (typeof record.reply === 'string') return record.reply;
    if (typeof record.text === 'string') return record.text;
    if (typeof record.content === 'string') return record.content;
    return JSON.stringify(payload);
  }

  private parseJsonLikeTestCases(value: string): AiGeneratedTestCase[] {
    const normalized = value
      .trim()
      .replace(/^```(?:json)?/i, '')
      .replace(/```$/i, '')
      .trim();
    const jsonStart = normalized.indexOf('{');
    const jsonEnd = normalized.lastIndexOf('}');
    if (jsonStart < 0 || jsonEnd < jsonStart) return [];

    try {
      const parsed = JSON.parse(normalized.slice(jsonStart, jsonEnd + 1)) as { testCases?: unknown };
      if (!Array.isArray(parsed.testCases)) return [];
      return parsed.testCases.map((item, index) => this.normalizeGeneratedCase(item, index));
    } catch {
      return [];
    }
  }

  private normalizeGeneratedCase(item: unknown, index: number): AiGeneratedTestCase {
    const record = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
    const title = (this.asString(record.title) || `AI generated test case ${index + 1}`).slice(0, 255);
    const description = this.cleanDescription(this.asString(record.description));
    return {
      title,
      description: description || `確認「${title}」符合需求規則與可驗證結果。`,
      preconditions: this.cleanPreconditions(this.asStringArray(record.preconditions)),
      expectedResult:
        this.cleanExpectedResult(this.asString(record.expectedResult) || this.asString(record.expected_result)) ||
        '預期結果待 QA 補充。',
      priority: this.normalizePriority(this.asString(record.priority)),
      suggestedTestLevel: this.normalizeSuggestedLevel(
        this.asString(record.suggestedTestLevel) || this.asString(record.suggested_test_level),
      ),
      reusabilityNote: this.asNullableString(record.reusabilityNote ?? record.reusability_note),
      unitTestRecommended: Boolean(record.unitTestRecommended ?? record.unit_test_recommended),
    };
  }

  private buildFallbackDrafts(content: string, documentContext?: string): AiGeneratedTestCase[] {
    const fullContent = `${documentContext ?? ''}\n${content}`;
    const heading = content.split(/\r?\n/).find((line) => line.trim().length > 0)?.replace(/^#+\s*/, '').trim();
    const subject = heading || '需求';
    if (/購物車|quantity|總數量|商品數量/.test(fullContent)) return this.buildCartQuantityFallbackDrafts();

    const mentionsLength = /長度|碼|字元|上限|下限|min|max/i.test(content);
    const mentionsPermission = /權限|角色|admin|pm|qa|developer/i.test(content);

    const drafts: AiGeneratedTestCase[] = [
      {
        title: `${subject}符合條件時允許完成操作`,
        description: `驗證使用者在符合需求規則與前置條件時，可以完成「${subject}」相關操作，系統會建立或更新正確資料。`,
        preconditions: ['使用者已登入且具備操作此功能的角色。', 'project 已存在，且需求描述所需資料已準備完成。'],
        expectedResult: '系統接受操作並回傳成功結果，相關資料可在後續查詢或列表中看到。',
        priority: 'p1',
        suggestedTestLevel: 'integration',
        reusabilityNote: 'Happy-path orchestration should be covered with integration tests.',
        unitTestRecommended: false,
      },
    ];

    if (mentionsLength) {
      drafts.push({
        title: `${subject}邊界值不符合限制時拒絕送出`,
        description: `驗證「${subject}」的長度或邊界限制會被嚴格套用，避免過短、過長或不合法輸入通過驗證。`,
        preconditions: ['使用者已登入。', '輸入欄位存在長度或邊界限制。'],
        expectedResult: '系統拒絕不符合限制的輸入，顯示可理解的錯誤訊息，且不寫入無效資料。',
        priority: 'p2',
        suggestedTestLevel: 'unit',
        reusabilityNote: 'Validation boundary rules should be covered with unit tests.',
        unitTestRecommended: true,
      });
    }

    if (mentionsPermission) {
      drafts.push({
        title: `${subject}未授權角色不可執行操作`,
        description: `驗證未具備權限的使用者無法執行「${subject}」相關操作，避免越權更新或檢視資料。`,
        preconditions: ['使用者已登入但不具備此功能的操作權限。'],
        expectedResult: '系統拒絕請求並回傳權限錯誤，資料狀態不會被修改。',
        priority: 'p1',
        suggestedTestLevel: 'unit',
        reusabilityNote: 'Permission policy checks should be covered with unit tests.',
        unitTestRecommended: true,
      });
    }

    if (drafts.length === 1) {
      drafts.push({
        title: `${subject}缺漏必要資料時顯示錯誤`,
        description: `驗證使用者送出「${subject}」時若缺少必要資料，系統會阻止操作並提示需要補齊的欄位。`,
        preconditions: ['使用者已登入且進入對應操作頁面。'],
        expectedResult: '系統顯示欄位驗證錯誤，不建立或更新不完整資料。',
        priority: 'p2',
        suggestedTestLevel: 'unit',
        reusabilityNote: 'Required-field validation should be covered with unit tests.',
        unitTestRecommended: true,
      });
    }

    return drafts;
  }

  private buildCartQuantityFallbackDrafts(): AiGeneratedTestCase[] {
    return [
      {
        title: '計算多個商品的總數量',
        description: '確認購物車包含多個商品時，每個商品的 quantity 可以正確加總。',
        preconditions: ['購物車包含商品 A quantity = 2、商品 B quantity = 3、商品 C quantity = 1。'],
        expectedResult: '回傳總商品數量為 6。',
        priority: 'p1',
        suggestedTestLevel: 'unit',
        reusabilityNote: 'Cart quantity aggregation should be covered with unit tests.',
        unitTestRecommended: true,
      },
      {
        title: '購物車沒有商品時回傳零',
        description: '確認空購物車不會產生計算錯誤，且總商品數量會以 0 表示。',
        preconditions: ['購物車商品清單為空陣列。'],
        expectedResult: '回傳總商品數量為 0。',
        priority: 'p1',
        suggestedTestLevel: 'unit',
        reusabilityNote: 'Empty cart quantity calculation should be covered with unit tests.',
        unitTestRecommended: true,
      },
      {
        title: '商品數量以數字進行加總',
        description: '確認系統使用數字型別計算 quantity，避免字串串接造成錯誤總數。',
        preconditions: ['購物車包含兩個商品，quantity 分別為數字 2 與數字 10。'],
        expectedResult: '回傳總商品數量為 12，不應回傳字串串接結果 210。',
        priority: 'p2',
        suggestedTestLevel: 'unit',
        reusabilityNote: 'Numeric quantity coercion rules should be covered with unit tests.',
        unitTestRecommended: true,
      },
      {
        title: '總數量計算不包含商品價格',
        description: '確認購物車總商品數量只加總 quantity，不會把商品價格納入計算。',
        preconditions: ['購物車包含商品 A quantity = 2 price = 100，以及商品 B quantity = 3 price = 50。'],
        expectedResult: '回傳總商品數量為 5，價格欄位不影響數量計算。',
        priority: 'p2',
        suggestedTestLevel: 'unit',
        reusabilityNote: 'Cart quantity calculation should stay independent from pricing logic.',
        unitTestRecommended: true,
      },
    ];
  }

  private asString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
  }

  private asNullableString(value: unknown): string | null {
    const text = this.asString(value);
    return text.length > 0 && text !== 'null' ? text : null;
  }

  private asStringArray(value: unknown): string[] {
    if (Array.isArray(value)) return value.map((item) => this.asString(item)).filter(Boolean);
    const text = this.asString(value);
    return text ? [text] : [];
  }

  private cleanDescription(value: string): string {
    return value
      .replace(/^type\s*:\s*(positive|negative)\s*$/gim, '')
      .replace(/^steps\s*:\s*$/gim, '')
      .replace(/^\d+\.\s+.+$/gm, '')
      .replace(/^[-*]\s+.+$/gm, '')
      .replace(/\b(type|positive|negative|steps)\b\s*:?\s*/gi, '')
      .trim();
  }

  private cleanPreconditions(values: string[]): string[] {
    const genericTexts = new Set([
      '需求內容已建立。',
      '需求內容已建立',
      '使用者具有執行此功能的權限。',
      '需求內容已建立，使用者具有執行此功能的權限。',
    ]);
    return values.filter((value) => value && !genericTexts.has(value.trim()));
  }

  private cleanExpectedResult(value: string): string {
    const genericTexts = new Set([
      '系統應符合需求描述的正常情境結果。',
      '系統應清楚處理錯誤情境，且不得產生未授權或不一致的資料變更。',
    ]);
    return genericTexts.has(value.trim()) ? '' : value.trim();
  }

  private normalizePriority(value: string): string {
    return ['p0', 'p1', 'p2', 'p3', 'high', 'medium', 'low'].includes(value) ? value : 'p2';
  }

  private normalizeSuggestedLevel(value: string): string {
    return ['unit', 'integration', 'e2e'].includes(value) ? value : 'integration';
  }
}
