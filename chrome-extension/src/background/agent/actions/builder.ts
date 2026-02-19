import { ActionResult, type AgentContext } from '@src/background/agent/types';
import {
  clickElementActionSchema,
  doubleClickActionSchema,
  tripleClickActionSchema,
  doneActionSchema,
  goBackActionSchema,
  goForwardActionSchema,
  goToUrlActionSchema,
  hoverElementActionSchema,
  inputTextActionSchema,
  openTabActionSchema,
  refreshPageActionSchema,
  searchGoogleActionSchema,
  switchTabActionSchema,
  type ActionSchema,
  sendKeysActionSchema,
  scrollToTextActionSchema,
  cacheContentActionSchema,
  selectDropdownOptionActionSchema,
  getDropdownOptionsActionSchema,
  closeTabActionSchema,
  waitActionSchema,
  previousPageActionSchema,
  scrollToPercentActionSchema,
  nextPageActionSchema,
  scrollToTopActionSchema,
  scrollToBottomActionSchema,
  queryHotelDataActionSchema,
  runIntegrationActionSchema,
  pushRatesToPmsActionSchema,
  parseGroupInquiryActionSchema,
  generateGroupQuoteActionSchema,
  sendGroupQuoteEmailActionSchema,
  askUserActionSchema,
} from './schemas';
import { z } from 'zod';
import { createLogger } from '@src/background/log';
import { ExecutionState, Actors } from '../event/types';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { wrapUntrustedContent } from '../messages/utils';
import type { ServerClient } from '@src/background/services/server';
import {
  deriveEmailData,
  renderEmailHtml,
  DEFAULT_EMAIL_TEMPLATE,
  type EmailTemplate,
} from '@src/background/services/group-quotes';

const logger = createLogger('Action');

const INTEGRATION_RESULT_MAX_LENGTH = 8000;

export class InvalidInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidInputError';
  }
}

/**
 * An action is a function that takes an input and returns an ActionResult
 */
export class Action {
  constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private readonly handler: (input: any) => Promise<ActionResult>,
    public readonly schema: ActionSchema,
    // Whether this action has an index argument
    public readonly hasIndex: boolean = false,
  ) {}

  async call(input: unknown): Promise<ActionResult> {
    // Validate input before calling the handler
    const schema = this.schema.schema;

    // check if the schema is schema: z.object({}), if so, ignore the input
    const isEmptySchema =
      schema instanceof z.ZodObject &&
      Object.keys((schema as z.ZodObject<Record<string, z.ZodTypeAny>>).shape || {}).length === 0;

    if (isEmptySchema) {
      return await this.handler({});
    }

    const parsedArgs = this.schema.schema.safeParse(input);
    if (!parsedArgs.success) {
      const errorMessage = parsedArgs.error.message;
      throw new InvalidInputError(errorMessage);
    }
    return await this.handler(parsedArgs.data);
  }

  name() {
    return this.schema.name;
  }

  /**
   * Returns the prompt for the action
   * @returns {string} The prompt for the action
   */
  prompt() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const schemaShape = (this.schema.schema as z.ZodObject<any>).shape || {};
    const schemaProperties = Object.entries(schemaShape).map(([key, value]) => {
      const zodValue = value as z.ZodTypeAny;
      return `'${key}': {'type': '${zodValue.description}', ${zodValue.isOptional() ? "'optional': true" : "'required': true"}}`;
    });

    const schemaStr =
      schemaProperties.length > 0 ? `{${this.name()}: {${schemaProperties.join(', ')}}}` : `{${this.name()}: {}}`;

    return `${this.schema.description}:\n${schemaStr}`;
  }

  /**
   * Get the index argument from the input if this action has an index
   * @param input The input to extract the index from
   * @returns The index value if found, null otherwise
   */
  getIndexArg(input: unknown): number | null {
    if (!this.hasIndex) {
      return null;
    }
    if (input && typeof input === 'object' && 'index' in input) {
      return (input as { index: number }).index;
    }
    return null;
  }

  /**
   * Set the index argument in the input if this action has an index
   * @param input The input to update the index in
   * @param newIndex The new index value to set
   * @returns Whether the index was set successfully
   */
  setIndexArg(input: unknown, newIndex: number): boolean {
    if (!this.hasIndex) {
      return false;
    }
    if (input && typeof input === 'object') {
      (input as { index: number }).index = newIndex;
      return true;
    }
    return false;
  }
}

// TODO: can not make every action optional, don't know why
export function buildDynamicActionSchema(actions: Action[]): z.ZodType {
  let schema = z.object({});
  for (const action of actions) {
    // create a schema for the action, it could be action.schema.schema or null
    // but don't use default: null as it causes issues with Google Generative AI
    const actionSchema = action.schema.schema;
    schema = schema.extend({
      [action.name()]: actionSchema.nullable().optional().describe(action.schema.description),
    });
  }
  return schema;
}

export class ActionBuilder {
  private readonly context: AgentContext;
  private readonly extractorLLM: BaseChatModel;
  private readonly serverClient: ServerClient | null;
  private readonly connectedIntegrations?: string;

  constructor(
    context: AgentContext,
    extractorLLM: BaseChatModel,
    serverClient?: ServerClient | null,
    connectedIntegrations?: string,
  ) {
    this.context = context;
    this.extractorLLM = extractorLLM;
    this.serverClient = serverClient ?? null;
    this.connectedIntegrations = connectedIntegrations;
  }

  buildDefaultActions() {
    const actions = [];
    let cachedQuoteEmailHtml: string | null = null;
    let cachedQuoteSummary: string | null = null;

    const done = new Action(async (input: z.infer<typeof doneActionSchema.schema>) => {
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, doneActionSchema.name);
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, input.text);
      return new ActionResult({
        isDone: true,
        extractedContent: input.text,
      });
    }, doneActionSchema);
    actions.push(done);

    const searchGoogle = new Action(async (input: z.infer<typeof searchGoogleActionSchema.schema>) => {
      const context = this.context;
      const intent = input.intent || `Searching for "${input.query}" in Google`;
      context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, intent);

      await context.browserContext.navigateTo(`https://www.google.com/search?q=${input.query}`);

      const msg2 = `Searched for "${input.query}" in Google`;
      context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg2);
      return new ActionResult({
        extractedContent: msg2,
        includeInMemory: true,
      });
    }, searchGoogleActionSchema);
    actions.push(searchGoogle);

    const goToUrl = new Action(async (input: z.infer<typeof goToUrlActionSchema.schema>) => {
      const intent = input.intent || `Navigating to ${input.url}`;
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, intent);

      await this.context.browserContext.navigateTo(input.url);
      const msg2 = `Navigated to ${input.url}`;
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg2);
      return new ActionResult({
        extractedContent: msg2,
        includeInMemory: true,
      });
    }, goToUrlActionSchema);
    actions.push(goToUrl);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const goBack = new Action(async (input: z.infer<typeof goBackActionSchema.schema>) => {
      const intent = input.intent || 'Navigating back';
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, intent);

      const page = await this.context.browserContext.getCurrentPage();
      await page.goBack();
      const msg2 = 'Navigated back';
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg2);
      return new ActionResult({
        extractedContent: msg2,
        includeInMemory: true,
      });
    }, goBackActionSchema);
    actions.push(goBack);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const goForward = new Action(async (input: z.infer<typeof goForwardActionSchema.schema>) => {
      const intent = input.intent || 'Navigating forward';
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, intent);

      const page = await this.context.browserContext.getCurrentPage();
      await page.goForward();
      const msg = 'Navigated forward';
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
      return new ActionResult({
        extractedContent: msg,
        includeInMemory: true,
      });
    }, goForwardActionSchema);
    actions.push(goForward);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const refreshPage = new Action(async (input: z.infer<typeof refreshPageActionSchema.schema>) => {
      const intent = input.intent || 'Refreshing page';
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, intent);

      const page = await this.context.browserContext.getCurrentPage();
      await page.refreshPage();
      const msg = 'Page refreshed';
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
      return new ActionResult({
        extractedContent: msg,
        includeInMemory: true,
      });
    }, refreshPageActionSchema);
    actions.push(refreshPage);

    const wait = new Action(async (input: z.infer<typeof waitActionSchema.schema>) => {
      const seconds = input.seconds || 3;
      const intent = input.intent || `Waiting for ${seconds} seconds`;
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, intent);
      await new Promise(resolve => setTimeout(resolve, seconds * 1000));
      const msg = `${seconds} seconds elapsed`;
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
      return new ActionResult({ extractedContent: msg, includeInMemory: true });
    }, waitActionSchema);
    actions.push(wait);

    const askUser = new Action(async (input: z.infer<typeof askUserActionSchema.schema>) => {
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, 'Asking user for input');

      const widgetData = {
        widgetId: crypto.randomUUID(),
        type: 'permission-request',
        data: {
          question: input.question,
          context: input.context,
          options: input.options,
        },
      };
      await this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.WIDGET_EVENT, JSON.stringify(widgetData));

      const userResponse = await this.context.waitForUserInput();

      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, `User responded: ${userResponse}`);
      return new ActionResult({
        extractedContent: `User responded: ${userResponse}`,
        includeInMemory: true,
      });
    }, askUserActionSchema);
    actions.push(askUser);

    // Element Interaction Actions
    const clickElement = new Action(
      async (input: z.infer<typeof clickElementActionSchema.schema>) => {
        const intent = input.intent || `Click element with index ${input.index}`;
        this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, intent);

        const page = await this.context.browserContext.getCurrentPage();
        const state = await page.getState();

        const elementNode = state?.selectorMap.get(input.index);
        if (!elementNode) {
          throw new Error(`Element with index ${input.index} does not exist - retry or use alternative actions`);
        }

        // Check if element is a file uploader
        if (page.isFileUploader(elementNode)) {
          const msg = `Index ${input.index} - this element opens a file upload dialog. File upload is not supported — use ask_user to request the user upload the file manually.`;
          logger.info(msg);
          return new ActionResult({
            extractedContent: msg,
            includeInMemory: true,
          });
        }

        try {
          const initialTabIds = await this.context.browserContext.getAllTabIds();
          await page.clickElementNode(this.context.options.useVision, elementNode);
          let msg = `Clicked button with index ${input.index}: ${elementNode.getAllTextTillNextClickableElement(2)}`;
          logger.info(msg);

          // TODO: could be optimized by chrome extension tab api
          const currentTabIds = await this.context.browserContext.getAllTabIds();
          if (currentTabIds.size > initialTabIds.size) {
            const newTabMsg = 'New tab opened - switching to it';
            msg += ` - ${newTabMsg}`;
            logger.info(newTabMsg);
            // find the tab id that is not in the initial tab ids
            const newTabId = Array.from(currentTabIds).find(id => !initialTabIds.has(id));
            if (newTabId) {
              await this.context.browserContext.switchTab(newTabId);
              await this.context.browserContext.tabGroupManager.addTab(newTabId);
            }
          }
          this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
          return new ActionResult({ extractedContent: msg, includeInMemory: true });
        } catch (error) {
          const msg = `Element no longer available with index ${input.index} - most likely the page changed`;
          this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_FAIL, msg);
          return new ActionResult({
            error: error instanceof Error ? error.message : String(error),
          });
        }
      },
      clickElementActionSchema,
      true,
    );
    actions.push(clickElement);

    const doubleClick = new Action(
      async (input: z.infer<typeof doubleClickActionSchema.schema>) => {
        const intent = input.intent || `Double-click element with index ${input.index}`;
        this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, intent);

        const page = await this.context.browserContext.getCurrentPage();
        const state = await page.getState();

        const elementNode = state?.selectorMap.get(input.index);
        if (!elementNode) {
          throw new Error(`Element with index ${input.index} does not exist - retry or use alternative actions`);
        }

        try {
          await page.doubleClickElementNode(this.context.options.useVision, elementNode);
          const msg = `Double-clicked element with index ${input.index}: ${elementNode.getAllTextTillNextClickableElement(2)}`;
          this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
          return new ActionResult({ extractedContent: msg, includeInMemory: true });
        } catch (error) {
          const msg = `Failed to double-click element with index ${input.index}`;
          this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_FAIL, msg);
          return new ActionResult({
            error: error instanceof Error ? error.message : String(error),
          });
        }
      },
      doubleClickActionSchema,
      true,
    );
    actions.push(doubleClick);

    const tripleClick = new Action(
      async (input: z.infer<typeof tripleClickActionSchema.schema>) => {
        const intent = input.intent || `Triple-click element with index ${input.index}`;
        this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, intent);

        const page = await this.context.browserContext.getCurrentPage();
        const state = await page.getState();

        const elementNode = state?.selectorMap.get(input.index);
        if (!elementNode) {
          throw new Error(`Element with index ${input.index} does not exist - retry or use alternative actions`);
        }

        try {
          await page.tripleClickElementNode(this.context.options.useVision, elementNode);
          const msg = `Triple-clicked element with index ${input.index}: ${elementNode.getAllTextTillNextClickableElement(2)}`;
          this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
          return new ActionResult({ extractedContent: msg, includeInMemory: true });
        } catch (error) {
          const msg = `Failed to triple-click element with index ${input.index}`;
          this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_FAIL, msg);
          return new ActionResult({
            error: error instanceof Error ? error.message : String(error),
          });
        }
      },
      tripleClickActionSchema,
      true,
    );
    actions.push(tripleClick);

    const hoverElement = new Action(
      async (input: z.infer<typeof hoverElementActionSchema.schema>) => {
        const intent = input.intent || `Hover over element with index ${input.index}`;
        this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, intent);

        const page = await this.context.browserContext.getCurrentPage();
        const state = await page.getState();

        const elementNode = state?.selectorMap.get(input.index);
        if (!elementNode) {
          throw new Error(`Element with index ${input.index} does not exist - retry or use alternative actions`);
        }

        try {
          await page.hoverElementNode(this.context.options.useVision, elementNode);
          const msg = `Hovered over element with index ${input.index}: ${elementNode.getAllTextTillNextClickableElement(2)}`;
          this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
          return new ActionResult({ extractedContent: msg, includeInMemory: true });
        } catch (error) {
          const msg = `Failed to hover over element with index ${input.index}`;
          this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_FAIL, msg);
          return new ActionResult({
            error: error instanceof Error ? error.message : String(error),
          });
        }
      },
      hoverElementActionSchema,
      true,
    );
    actions.push(hoverElement);

    const inputText = new Action(
      async (input: z.infer<typeof inputTextActionSchema.schema>) => {
        const intent = input.intent || `Input text into index ${input.index}`;
        this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, intent);

        const page = await this.context.browserContext.getCurrentPage();
        const state = await page.getState();

        const elementNode = state?.selectorMap.get(input.index);
        if (!elementNode) {
          throw new Error(`Element with index ${input.index} does not exist - retry or use alternative actions`);
        }

        await page.inputTextElementNode(this.context.options.useVision, elementNode, input.text);
        const msg = `Input ${input.text} into index ${input.index}`;
        this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
        return new ActionResult({ extractedContent: msg, includeInMemory: true });
      },
      inputTextActionSchema,
      true,
    );
    actions.push(inputText);

    // Tab Management Actions
    const switchTab = new Action(async (input: z.infer<typeof switchTabActionSchema.schema>) => {
      const intent = input.intent || `Switching to tab ${input.tab_id}`;
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, intent);
      await this.context.browserContext.switchTab(input.tab_id);
      const msg = `Switched to tab ${input.tab_id}`;
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
      return new ActionResult({ extractedContent: msg, includeInMemory: true });
    }, switchTabActionSchema);
    actions.push(switchTab);

    const openTab = new Action(async (input: z.infer<typeof openTabActionSchema.schema>) => {
      const intent = input.intent || `Opening ${input.url} in new tab`;
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, intent);
      await this.context.browserContext.openTab(input.url);
      const msg = `Opened ${input.url} in new tab`;
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
      return new ActionResult({ extractedContent: msg, includeInMemory: true });
    }, openTabActionSchema);
    actions.push(openTab);

    const closeTab = new Action(async (input: z.infer<typeof closeTabActionSchema.schema>) => {
      const intent = input.intent || `Closing tab ${input.tab_id}`;
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, intent);
      await this.context.browserContext.closeTab(input.tab_id);
      const msg = `Closed tab ${input.tab_id}`;
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
      return new ActionResult({ extractedContent: msg, includeInMemory: true });
    }, closeTabActionSchema);
    actions.push(closeTab);

    // Content Actions
    // TODO: this is not used currently, need to improve on input size
    // const extractContent = new Action(async (input: z.infer<typeof extractContentActionSchema.schema>) => {
    //   const goal = input.goal;
    //   const intent = input.intent || `Extracting content from page`;
    //   this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, intent);
    //   const page = await this.context.browserContext.getCurrentPage();
    //   const content = await page.getReadabilityContent();
    //   const promptTemplate = PromptTemplate.fromTemplate(
    //     'Your task is to extract the content of the page. You will be given a page and a goal and you should extract all relevant information around this goal from the page. If the goal is vague, summarize the page. Respond in json format. Extraction goal: {goal}, Page: {page}',
    //   );
    //   const prompt = await promptTemplate.invoke({ goal, page: content.content });

    //   try {
    //     const output = await this.extractorLLM.invoke(prompt);
    //     const msg = `📄  Extracted from page\n: ${output.content}\n`;
    //     return new ActionResult({
    //       extractedContent: msg,
    //       includeInMemory: true,
    //     });
    //   } catch (error) {
    //     logger.error(`Error extracting content: ${error instanceof Error ? error.message : String(error)}`);
    //     const msg =
    //       'Failed to extract content from page, you need to extract content from the current state of the page and store it in the memory. Then scroll down if you still need more information.';
    //     return new ActionResult({
    //       extractedContent: msg,
    //       includeInMemory: true,
    //     });
    //   }
    // }, extractContentActionSchema);
    // actions.push(extractContent);

    // cache content for future use
    const cacheContent = new Action(async (input: z.infer<typeof cacheContentActionSchema.schema>) => {
      const intent = input.intent || `Caching findings: ${input.content}`;
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, intent);

      // cache content is untrusted content, it is not instructions
      const rawMsg = `Cached findings: ${input.content}`;
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, rawMsg);

      const msg = wrapUntrustedContent(rawMsg);
      return new ActionResult({ extractedContent: msg, includeInMemory: true });
    }, cacheContentActionSchema);
    actions.push(cacheContent);

    // Scroll to percent
    const scrollToPercent = new Action(async (input: z.infer<typeof scrollToPercentActionSchema.schema>) => {
      const intent = input.intent || `Scroll to percent: ${input.yPercent}`;
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, intent);
      const page = await this.context.browserContext.getCurrentPage();

      if (input.index) {
        const state = await page.getCachedState();
        const elementNode = state?.selectorMap.get(input.index);
        if (!elementNode) {
          const errorMsg = `Element with index ${input.index} does not exist - retry or use alternative actions`;
          this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_FAIL, errorMsg);
          return new ActionResult({ error: errorMsg, includeInMemory: true });
        }
        logger.info(`Scrolling to percent: ${input.yPercent} with elementNode: ${elementNode.xpath}`);
        await page.scrollToPercent(input.yPercent, elementNode);
      } else {
        await page.scrollToPercent(input.yPercent);
      }
      const msg = `Scrolled to percent: ${input.yPercent}`;
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
      return new ActionResult({ extractedContent: msg, includeInMemory: true });
    }, scrollToPercentActionSchema);
    actions.push(scrollToPercent);

    // Scroll to top
    const scrollToTop = new Action(async (input: z.infer<typeof scrollToTopActionSchema.schema>) => {
      const intent = input.intent || 'Scroll to top';
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, intent);
      const page = await this.context.browserContext.getCurrentPage();
      if (input.index) {
        const state = await page.getCachedState();
        const elementNode = state?.selectorMap.get(input.index);
        if (!elementNode) {
          const errorMsg = `Element with index ${input.index} does not exist - retry or use alternative actions`;
          this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_FAIL, errorMsg);
          return new ActionResult({ error: errorMsg, includeInMemory: true });
        }
        await page.scrollToPercent(0, elementNode);
      } else {
        await page.scrollToPercent(0);
      }
      const msg = 'Scrolled to top';
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
      return new ActionResult({ extractedContent: msg, includeInMemory: true });
    }, scrollToTopActionSchema);
    actions.push(scrollToTop);

    // Scroll to bottom
    const scrollToBottom = new Action(async (input: z.infer<typeof scrollToBottomActionSchema.schema>) => {
      const intent = input.intent || 'Scroll to bottom';
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, intent);
      const page = await this.context.browserContext.getCurrentPage();
      if (input.index) {
        const state = await page.getCachedState();
        const elementNode = state?.selectorMap.get(input.index);
        if (!elementNode) {
          const errorMsg = `Element with index ${input.index} does not exist - retry or use alternative actions`;
          this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_FAIL, errorMsg);
          return new ActionResult({ error: errorMsg, includeInMemory: true });
        }
        await page.scrollToPercent(100, elementNode);
      } else {
        await page.scrollToPercent(100);
      }
      const msg = 'Scrolled to bottom';
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
      return new ActionResult({ extractedContent: msg, includeInMemory: true });
    }, scrollToBottomActionSchema);
    actions.push(scrollToBottom);

    // Scroll to previous page
    const previousPage = new Action(async (input: z.infer<typeof previousPageActionSchema.schema>) => {
      const intent = input.intent || 'Scroll to previous page';
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, intent);
      const page = await this.context.browserContext.getCurrentPage();

      if (input.index) {
        const state = await page.getCachedState();
        const elementNode = state?.selectorMap.get(input.index);
        if (!elementNode) {
          const errorMsg = `Element with index ${input.index} does not exist - retry or use alternative actions`;
          this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_FAIL, errorMsg);
          return new ActionResult({ error: errorMsg, includeInMemory: true });
        }

        // Check if element is already at top of its scrollable area
        try {
          const [elementScrollTop] = await page.getElementScrollInfo(elementNode);
          if (elementScrollTop === 0) {
            const msg = `Element with index ${input.index} is already at top, cannot scroll to previous page`;
            this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
            return new ActionResult({ extractedContent: msg, includeInMemory: true });
          }
        } catch (error) {
          // If we can't get scroll info, let the scrollToPreviousPage method handle it
          logger.warning(
            `Could not get element scroll info: ${error instanceof Error ? error.message : String(error)}`,
          );
        }

        await page.scrollToPreviousPage(elementNode);
      } else {
        // Check if page is already at top
        const [initialScrollY] = await page.getScrollInfo();
        if (initialScrollY === 0) {
          const msg = 'Already at top of page, cannot scroll to previous page';
          this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
          return new ActionResult({ extractedContent: msg, includeInMemory: true });
        }

        await page.scrollToPreviousPage();
      }
      const msg = 'Scrolled to previous page';
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
      return new ActionResult({ extractedContent: msg, includeInMemory: true });
    }, previousPageActionSchema);
    actions.push(previousPage);

    // Scroll to next page
    const nextPage = new Action(async (input: z.infer<typeof nextPageActionSchema.schema>) => {
      const intent = input.intent || 'Scroll to next page';
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, intent);
      const page = await this.context.browserContext.getCurrentPage();

      if (input.index) {
        const state = await page.getCachedState();
        const elementNode = state?.selectorMap.get(input.index);
        if (!elementNode) {
          const errorMsg = `Element with index ${input.index} does not exist - retry or use alternative actions`;
          this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_FAIL, errorMsg);
          return new ActionResult({ error: errorMsg, includeInMemory: true });
        }

        // Check if element is already at bottom of its scrollable area
        try {
          const [elementScrollTop, elementClientHeight, elementScrollHeight] =
            await page.getElementScrollInfo(elementNode);
          if (elementScrollTop + elementClientHeight >= elementScrollHeight) {
            const msg = `Element with index ${input.index} is already at bottom, cannot scroll to next page`;
            this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
            return new ActionResult({ extractedContent: msg, includeInMemory: true });
          }
        } catch (error) {
          // If we can't get scroll info, let the scrollToNextPage method handle it
          logger.warning(
            `Could not get element scroll info: ${error instanceof Error ? error.message : String(error)}`,
          );
        }

        await page.scrollToNextPage(elementNode);
      } else {
        // Check if page is already at bottom
        const [initialScrollY, initialVisualViewportHeight, initialScrollHeight] = await page.getScrollInfo();
        if (initialScrollY + initialVisualViewportHeight >= initialScrollHeight) {
          const msg = 'Already at bottom of page, cannot scroll to next page';
          this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
          return new ActionResult({ extractedContent: msg, includeInMemory: true });
        }

        await page.scrollToNextPage();
      }
      const msg = 'Scrolled to next page';
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
      return new ActionResult({ extractedContent: msg, includeInMemory: true });
    }, nextPageActionSchema);
    actions.push(nextPage);

    // Scroll to text
    const scrollToText = new Action(async (input: z.infer<typeof scrollToTextActionSchema.schema>) => {
      const intent = input.intent || `Scroll to text: ${input.text}, occurrence ${input.nth}`;
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, intent);

      const page = await this.context.browserContext.getCurrentPage();
      try {
        const scrolled = await page.scrollToText(input.text, input.nth);
        const msg = scrolled
          ? `Scrolled to text: ${input.text}, occurrence ${input.nth}`
          : `Text '${input.text}' (occurrence ${input.nth}) not found or not visible`;
        this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
        return new ActionResult({ extractedContent: msg, includeInMemory: true });
      } catch (error) {
        const msg = `Failed to scroll to text: ${error instanceof Error ? error.message : String(error)}`;
        this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_FAIL, msg);
        return new ActionResult({ error: msg, includeInMemory: true });
      }
    }, scrollToTextActionSchema);
    actions.push(scrollToText);

    // Keyboard Actions
    const sendKeys = new Action(async (input: z.infer<typeof sendKeysActionSchema.schema>) => {
      const intent = input.intent || `Send keys: ${input.keys}`;
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, intent);

      const page = await this.context.browserContext.getCurrentPage();
      await page.sendKeys(input.keys);
      const msg = `Sent keys: ${input.keys}`;
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
      return new ActionResult({ extractedContent: msg, includeInMemory: true });
    }, sendKeysActionSchema);
    actions.push(sendKeys);

    // Get all options from a native dropdown
    const getDropdownOptions = new Action(
      async (input: z.infer<typeof getDropdownOptionsActionSchema.schema>) => {
        const intent = input.intent || `Getting options from dropdown with index ${input.index}`;
        this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, intent);

        const page = await this.context.browserContext.getCurrentPage();
        const state = await page.getState();

        const elementNode = state?.selectorMap.get(input.index);
        if (!elementNode) {
          const errorMsg = `Element with index ${input.index} does not exist - retry or use alternative actions`;
          this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_FAIL, errorMsg);
          return new ActionResult({
            error: errorMsg,
            includeInMemory: true,
          });
        }

        try {
          // Use the existing getDropdownOptions method
          const options = await page.getDropdownOptions(input.index);

          if (options && options.length > 0) {
            // Format options for display
            const formattedOptions: string[] = options.map(opt => {
              // Encoding ensures AI uses the exact string in select_dropdown_option
              const encodedText = JSON.stringify(opt.text);
              return `${opt.index}: text=${encodedText}`;
            });

            let msg = formattedOptions.join('\n');
            msg += '\n' + 'Use the exact text string in select_dropdown_option';
            this.context.emitEvent(
              Actors.NAVIGATOR,
              ExecutionState.ACT_OK,
              `Got ${options.length} options from dropdown`,
            );
            return new ActionResult({
              extractedContent: msg,
              includeInMemory: true,
            });
          }

          // This code should not be reached as getDropdownOptions throws an error when no options found
          // But keeping as fallback
          const msg = 'No options found in dropdown';
          this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
          return new ActionResult({
            extractedContent: msg,
            includeInMemory: true,
          });
        } catch (error) {
          const errorMsg = `Failed to get dropdown options: ${error instanceof Error ? error.message : String(error)}`;
          this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_FAIL, errorMsg);
          return new ActionResult({
            error: errorMsg,
            includeInMemory: true,
          });
        }
      },
      getDropdownOptionsActionSchema,
      true,
    );
    actions.push(getDropdownOptions);

    // Select dropdown option for interactive element index by the text of the option you want to select'
    const selectDropdownOption = new Action(
      async (input: z.infer<typeof selectDropdownOptionActionSchema.schema>) => {
        const intent = input.intent || `Select option "${input.text}" from dropdown with index ${input.index}`;
        this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, intent);

        const page = await this.context.browserContext.getCurrentPage();
        const state = await page.getState();

        const elementNode = state?.selectorMap.get(input.index);
        if (!elementNode) {
          const errorMsg = `Element with index ${input.index} does not exist - retry or use alternative actions`;
          this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_FAIL, errorMsg);
          return new ActionResult({
            error: errorMsg,
            includeInMemory: true,
          });
        }

        // Validate that we're working with a select element
        if (!elementNode.tagName || elementNode.tagName.toLowerCase() !== 'select') {
          const errorMsg = `Cannot select option: Element with index ${input.index} is a ${elementNode.tagName || 'unknown'}, not a SELECT`;
          this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_FAIL, errorMsg);
          return new ActionResult({
            error: errorMsg,
            includeInMemory: true,
          });
        }

        logger.debug(`Attempting to select '${input.text}' using xpath: ${elementNode.xpath}`);

        try {
          const result = await page.selectDropdownOption(input.index, input.text);
          const msg = `Selected option "${input.text}" from dropdown with index ${input.index}`;
          this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
          return new ActionResult({
            extractedContent: result,
            includeInMemory: true,
          });
        } catch (error) {
          const errorMsg = `Failed to select option: ${error instanceof Error ? error.message : String(error)}`;
          this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_FAIL, errorMsg);
          return new ActionResult({
            error: errorMsg,
            includeInMemory: true,
          });
        }
      },
      selectDropdownOptionActionSchema,
      true,
    );
    actions.push(selectDropdownOption);

    if (this.serverClient) {
      const serverClient = this.serverClient;
      const context = this.context;
      const queryHotelData = new Action(async (params: { intent?: string; query: string }) => {
        try {
          const intent = params.intent || 'Querying hotel data...';
          context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, intent);
          const result = await serverClient.queryData(params.query);
          if (result.escalation) {
            context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, 'Hotel data unavailable - needs browser');
            return new ActionResult({
              extractedContent: '[Hotel data unavailable for this query — requires browser]',
              includeInMemory: true,
            });
          }
          context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, 'Hotel data retrieved');
          return new ActionResult({
            extractedContent: result.text ?? '',
            includeInMemory: true,
          });
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_FAIL, errorMsg);
          return new ActionResult({
            extractedContent: `[Hotel data query failed: ${errorMsg}]`,
            error: errorMsg,
            includeInMemory: true,
          });
        }
      }, queryHotelDataActionSchema);
      actions.push(queryHotelData);

      const pushRates = new Action(async (params: { intent?: string; start_date: string; end_date: string }) => {
        try {
          const intent = params.intent || `Pushing rates to PMS for ${params.start_date} to ${params.end_date}`;
          context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, intent);

          const result = await serverClient.pushRates(params.start_date, params.end_date);
          if (!result.success) {
            context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_FAIL, result.error ?? 'Failed to push rates');
            return new ActionResult({
              error: result.error ?? 'Failed to push rates',
              includeInMemory: true,
            });
          }
          const msg = result.message ?? 'Rates pushed to PMS successfully.';
          context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
          return new ActionResult({ extractedContent: msg, includeInMemory: true });
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_FAIL, errorMsg);
          return new ActionResult({
            extractedContent: `[Push rates failed: ${errorMsg}]`,
            error: errorMsg,
            includeInMemory: true,
          });
        }
      }, pushRatesToPmsActionSchema);
      actions.push(pushRates);

      const parseGroupInquiry = new Action(async (params: { intent?: string; email_text: string }) => {
        try {
          const intent = params.intent || 'Parsing group booking inquiry...';
          context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, intent);
          const result = await serverClient.parseGroupInquiry(params.email_text);
          if (!result.success) {
            context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_FAIL, result.error ?? 'Failed to parse inquiry');
            return new ActionResult({ error: result.error ?? 'Failed to parse inquiry', includeInMemory: true });
          }
          context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, 'Group inquiry parsed');
          return new ActionResult({ extractedContent: JSON.stringify(result.data), includeInMemory: true });
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_FAIL, errorMsg);
          return new ActionResult({
            extractedContent: `[Parse group inquiry failed: ${errorMsg}]`,
            error: errorMsg,
            includeInMemory: true,
          });
        }
      }, parseGroupInquiryActionSchema);
      actions.push(parseGroupInquiry);

      const generateGroupQuote = new Action(
        async (params: {
          intent?: string;
          check_in_date: string;
          check_out_date: string;
          room_count: number;
          context?: string;
          guest_name?: string;
          discount_percent?: number;
        }) => {
          try {
            const intent = params.intent || 'Generating group booking quote...';
            context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, intent);

            const [settingsResult, quoteResult] = await Promise.all([
              serverClient.getGroupQuoteSettings(),
              serverClient.generateGroupQuote({
                checkInDate: params.check_in_date,
                checkOutDate: params.check_out_date,
                roomCount: params.room_count,
                context: params.context,
                guestName: params.guest_name,
                discountPercent: params.discount_percent,
              }),
            ]);

            if (!quoteResult.success) {
              context.emitEvent(
                Actors.NAVIGATOR,
                ExecutionState.ACT_FAIL,
                quoteResult.error ?? 'Failed to generate quote',
              );
              return new ActionResult({
                error: quoteResult.error ?? 'Failed to generate quote',
                includeInMemory: true,
              });
            }

            const data = quoteResult.data as {
              allocation: Array<{
                date: string;
                rooms: Array<{ roomType: string; count: number; rate: number; originalRate: number }>;
              }>;
              metrics: {
                totalRevenue: number;
                groupADR: number;
                discountPercent: number;
                totalRoomNights?: number;
                occupancyBefore: number;
                occupancyAfter: number;
              };
              emailDraft: {
                template?: { greeting: string; introduction: string; closing: string; signature: string };
                subject?: string;
                text: string;
              };
            };

            if (!data.allocation || !data.metrics || !data.emailDraft) {
              context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_FAIL, 'Invalid quote response structure');
              return new ActionResult({
                error: 'Invalid quote response structure',
                includeInMemory: true,
              });
            }

            const hotelInfo = settingsResult?.data?.hotelInfo ?? {
              hotelName: '',
              contactName: '',
              contactEmail: '',
              contactPhone: '',
            };
            const template: EmailTemplate =
              data.emailDraft.template ?? settingsResult?.data?.emailTemplate ?? DEFAULT_EMAIL_TEMPLATE;

            const emailData = deriveEmailData(
              data.allocation,
              {
                totalRevenue: data.metrics.totalRevenue,
                groupADR: data.metrics.groupADR,
                discountPercent: data.metrics.discountPercent,
                totalRoomNights: data.metrics.totalRoomNights,
              },
              hotelInfo,
              {
                guestName: params.guest_name,
                checkInDate: params.check_in_date,
                checkOutDate: params.check_out_date,
              },
            );
            const emailHtml = renderEmailHtml(template, emailData);

            cachedQuoteEmailHtml = emailHtml;

            const summary = [
              `Quote generated:`,
              `- Total Revenue: $${data.metrics.totalRevenue}`,
              `- Group ADR: $${data.metrics.groupADR}/night`,
              `- Discount: ${data.metrics.discountPercent}%`,
              `- Occupancy: ${data.metrics.occupancyBefore}% → ${data.metrics.occupancyAfter}%`,
              `- Email Subject: ${data.emailDraft.subject ?? 'Group Booking Quote'}`,
            ].join('\n');

            cachedQuoteSummary = summary;

            const widgetData = {
              widgetId: crypto.randomUUID(),
              type: 'permission-request',
              data: {
                question: 'Review the generated group booking quote:',
                context: summary,
                htmlContent: emailHtml,
                options: [
                  { label: 'Looks good', value: 'approve' },
                  { label: 'Cancel', value: 'cancel' },
                ],
              },
            };
            await context.emitEvent(Actors.NAVIGATOR, ExecutionState.WIDGET_EVENT, JSON.stringify(widgetData));

            const userResponse = await context.waitForUserInput();
            if (userResponse.toLowerCase() !== 'approve') {
              cachedQuoteEmailHtml = null;
              cachedQuoteSummary = null;
              context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, 'Quote cancelled by user');
              return new ActionResult({
                extractedContent: 'User cancelled the generated quote.',
                includeInMemory: true,
              });
            }

            context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, 'Group quote approved');
            return new ActionResult({
              extractedContent: `${summary}\n\nUser approved the quote (HTML email preview was shown). Proceed directly to send_group_quote_email — do NOT use ask_user again.`,
              includeInMemory: true,
            });
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_FAIL, errorMsg);
            return new ActionResult({
              extractedContent: `[Generate group quote failed: ${errorMsg}]`,
              error: errorMsg,
              includeInMemory: true,
            });
          }
        },
        generateGroupQuoteActionSchema,
      );
      actions.push(generateGroupQuote);
    }

    if (this.serverClient && this.connectedIntegrations) {
      const serverClient = this.serverClient;
      const context = this.context;
      const runIntegration = new Action(
        async (params: {
          intent?: string;
          action_key: string;
          app_slug: string;
          parameters: Record<string, unknown>;
        }) => {
          try {
            const intent = params.intent || `Running ${params.app_slug}: ${params.action_key}`;
            context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, intent);
            const request = {
              actionKey: params.action_key,
              appSlug: params.app_slug,
              parameters: params.parameters,
            };
            console.log('[Integration] Request:', JSON.stringify(request, null, 2));
            const result = await serverClient.runIntegrationAction(request);
            console.log('[Integration] Response:', JSON.stringify(result, null, 2));
            if (!result.success) {
              context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_FAIL, result.error ?? 'Integration action failed');
              return new ActionResult({
                error: result.error ?? 'Integration action failed',
                includeInMemory: true,
              });
            }
            const raw = JSON.stringify(result.data);
            const extractedContent =
              raw.length > INTEGRATION_RESULT_MAX_LENGTH
                ? raw.slice(0, INTEGRATION_RESULT_MAX_LENGTH) + '... (truncated)'
                : raw;
            context.emitEvent(
              Actors.NAVIGATOR,
              ExecutionState.ACT_OK,
              `Integration result: ${params.action_key} completed`,
            );
            return new ActionResult({ extractedContent, includeInMemory: true });
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_FAIL, errorMsg);
            return new ActionResult({
              extractedContent: `[Integration action failed: ${errorMsg}]`,
              error: errorMsg,
              includeInMemory: true,
            });
          }
        },
        {
          ...runIntegrationActionSchema,
          description: `${runIntegrationActionSchema.description}. Available actions:\n${this.connectedIntegrations}`,
        },
      );
      actions.push(runIntegration);

      const sendGroupQuoteEmail = new Action(async (params: { intent?: string; to: string[]; subject: string }) => {
        try {
          if (!cachedQuoteEmailHtml) {
            context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_FAIL, 'No quote email to send');
            return new ActionResult({
              error: 'No quote email has been generated yet. Use generate_group_quote first.',
              includeInMemory: true,
            });
          }

          const intent = params.intent || `Sending group quote email to ${params.to.join(', ')}`;
          context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, intent);

          const widgetData = {
            widgetId: crypto.randomUUID(),
            type: 'permission-request',
            data: {
              question: `Send the group booking quote email?`,
              context: `**To:** ${params.to.join(', ')}\n**Subject:** ${params.subject}\n\n${cachedQuoteSummary ?? ''}`,
              htmlContent: cachedQuoteEmailHtml,
              options: [
                { label: 'Send', value: 'confirm' },
                { label: 'Cancel', value: 'cancel' },
              ],
            },
          };
          await context.emitEvent(Actors.NAVIGATOR, ExecutionState.WIDGET_EVENT, JSON.stringify(widgetData));

          const userResponse = await context.waitForUserInput();
          if (userResponse.toLowerCase() !== 'confirm') {
            context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, 'Email send cancelled by user.');
            return new ActionResult({ extractedContent: 'Email send cancelled by user.', includeInMemory: true });
          }

          const result = await serverClient.runIntegrationAction({
            actionKey: 'gmail-send-email',
            appSlug: 'gmail',
            parameters: { to: params.to, subject: params.subject, body: cachedQuoteEmailHtml, bodyType: 'html' },
          });

          if (!result.success) {
            context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_FAIL, result.error ?? 'Failed to send email');
            return new ActionResult({ error: result.error ?? 'Failed to send email', includeInMemory: true });
          }

          cachedQuoteEmailHtml = null;
          cachedQuoteSummary = null;
          const msg = `Quote email sent to ${params.to.join(', ')}.`;
          context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
          return new ActionResult({ extractedContent: msg, includeInMemory: true });
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_FAIL, errorMsg);
          return new ActionResult({
            extractedContent: `[Send group quote email failed: ${errorMsg}]`,
            error: errorMsg,
            includeInMemory: true,
          });
        }
      }, sendGroupQuoteEmailActionSchema);
      actions.push(sendGroupQuoteEmail);
    }

    return actions;
  }
}
