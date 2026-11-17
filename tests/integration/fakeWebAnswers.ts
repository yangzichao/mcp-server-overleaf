/** What a fake web route answers with, written to the response by `FakeOverleafWeb.handle`. */
export interface FakeAnswer {
  readonly status: number;
  readonly contentType?: string;
  readonly body?: string | Buffer;
}

export const NO_CONTENT: FakeAnswer = { status: 204 };

export const NOT_FOUND: FakeAnswer = {
  status: 404,
  contentType: "application/json",
  body: JSON.stringify({ message: "not found" }),
};

export function jsonAnswer(value: unknown): FakeAnswer {
  return { status: 200, contentType: "application/json", body: JSON.stringify(value) };
}
