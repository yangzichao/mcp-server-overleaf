/** What a person answers through an MCP client's elicitation form, as `elicitation/create` returns it. */
export type ElicitationAnswer =
  | { readonly action: "accept"; readonly content: Record<string, unknown> }
  | { readonly action: "decline" | "cancel" };

/** The parts of an `elicitation/create` request a test asserts on. */
export interface ElicitationQuestion {
  readonly mode?: string;
  readonly message: string;
  readonly requestedSchema: {
    readonly type: string;
    readonly properties: Record<string, { readonly type: string; readonly title?: string }>;
    readonly required?: readonly string[];
  };
}

const CONFIRMS: ElicitationAnswer = { action: "accept", content: { confirm: true } };

/** Stands in for the person using an MCP client that supports form elicitation. */
export class PersonAtTheClient {
  readonly questions: ElicitationQuestion[] = [];
  nextAnswer: ElicitationAnswer = CONFIRMS;

  answer(question: ElicitationQuestion): ElicitationAnswer {
    this.questions.push(question);
    return this.nextAnswer;
  }
}
