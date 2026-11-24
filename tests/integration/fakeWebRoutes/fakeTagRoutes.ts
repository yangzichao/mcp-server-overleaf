import { type FakeAnswer, jsonAnswer, NO_CONTENT, plainTextAnswer } from "../fakeWebAnswers.js";
import { type FakeWebRequest, type FakeWebRoutes, matchPath, readJsonBody } from "./fakeWebRequest.js";

/**
 * The account's tags as `TagsController` and `TagsHandler` keep them: a duplicate name answers
 * with the existing tag, and adding or removing a project answers 204 whether or not the tag
 * exists, because `Tag.updateOne` simply matches nothing.
 */

export interface FakeTag {
  _id: string;
  user_id: string;
  name: string;
  color?: string;
  project_ids: string[];
}

const TAG_COLOR_PATTERN = /^(#[a-fA-F0-9]{6}|hsl\(\d{1,3}, 70%, 45%\))$/;

export class FakeTagRoutes implements FakeWebRoutes {
  readonly tags: FakeTag[] = [];
  private nextTagNumber = 0;

  constructor(private readonly userId: string) {}

  addTag(name: string, projectIds: string[] = []): FakeTag {
    this.nextTagNumber += 1;
    const tag: FakeTag = {
      _id: `64f1${String(this.nextTagNumber).padStart(20, "0")}`,
      user_id: this.userId,
      name,
      project_ids: projectIds,
    };
    this.tags.push(tag);
    return tag;
  }

  route(request: FakeWebRequest): FakeAnswer | undefined {
    if (matchPath(request, "GET", /^\/tag$/)) return jsonAnswer(this.tags);
    if (matchPath(request, "POST", /^\/tag$/)) return this.createTag(request);
    const membership = /^\/tag\/([0-9a-f]{24})\/project\/([0-9a-f]{24})$/.exec(request.path);
    if (membership?.[1] && membership[2] && (request.method === "POST" || request.method === "DELETE")) {
      const tag = this.tags.find((candidate) => candidate._id === membership[1]);
      const projectId = membership[2];
      if (tag && request.method === "POST" && !tag.project_ids.includes(projectId))
        tag.project_ids.push(projectId);
      if (tag && request.method === "DELETE")
        tag.project_ids = tag.project_ids.filter((id) => id !== projectId);
      return NO_CONTENT;
    }
    return undefined;
  }

  private createTag(request: FakeWebRequest): FakeAnswer {
    const { name, color } = readJsonBody(request);
    if (typeof name !== "string" || name.length === 0) return plainTextAnswer(400, "Bad Request");
    if (color !== undefined && (typeof color !== "string" || !TAG_COLOR_PATTERN.test(color))) {
      return plainTextAnswer(400, "Bad Request");
    }
    // TagsHandler throws 'Exceeded max tag length', which reaches the user as a 500.
    if (name.length > 50) return plainTextAnswer(500, "Internal Server Error");
    const existing = this.tags.find((tag) => tag.name === name);
    if (existing) return jsonAnswer(existing);
    const tag = this.addTag(name);
    if (typeof color === "string") tag.color = color;
    return jsonAnswer(tag);
  }
}
