import { afterEach, beforeEach } from "vitest";

import { OverleafRealtimeSession } from "../../../../src/overleaf/realtime/overleafRealtimeSession.js";
import { OverleafWebClient } from "../../../../src/overleaf/web/overleafWebClient.js";
import { FakeOverleafRealtime } from "../../../integration/fakeOverleafRealtime.js";

/**
 * A fake Overleaf started before and stopped after every test in the calling file, with a web
 * client for it and a way to read the project the way a new editor connection would see it,
 * which is how a test checks that a web route's change reached the real-time side.
 */

export interface JoinedProject {
  readonly project: OverleafRealtimeSession["project"];
  readonly details: OverleafRealtimeSession["details"];
  readonly permissionsLevel: string;
}

export interface FakeOverleafConnection {
  readonly overleaf: FakeOverleafRealtime;
  client(cookieHeader?: string): OverleafWebClient;
  joinProject(): Promise<JoinedProject>;
  /** Non-GET requests the fake received for paths matching `pattern`. */
  changesSentTo(pattern: RegExp): string[];
}

export function useFakeOverleafConnection(): FakeOverleafConnection {
  let current: FakeOverleafRealtime | undefined;
  beforeEach(async () => {
    current = await FakeOverleafRealtime.start();
    current.addDocument("main.tex", "\\documentclass{article}\n\\begin{document}\nHello.\n\\end{document}\n");
    current.addDocument("sections/introduction.tex", "\\section{Introduction}\n");
  });
  afterEach(async () => {
    await current?.stop();
  });
  const overleaf = (): FakeOverleafRealtime => {
    if (!current) throw new Error("The fake Overleaf is not running.");
    return current;
  };
  return {
    get overleaf() {
      return overleaf();
    },
    client(cookieHeader = overleaf().cookieHeader) {
      return new OverleafWebClient({ baseUrl: overleaf().baseUrl, cookieHeader, requestTimeoutMs: 5_000 });
    },
    async joinProject() {
      const session = await OverleafRealtimeSession.open({
        baseUrl: overleaf().baseUrl,
        cookieHeader: overleaf().cookieHeader,
        overleafProjectId: overleaf().projectId,
      });
      session.close();
      return {
        project: session.project,
        details: session.details,
        permissionsLevel: session.permissionsLevel,
      };
    },
    changesSentTo(pattern) {
      return overleaf()
        .web.requests.filter((request) => request.method !== "GET" && pattern.test(request.path))
        .map((request) => `${request.method} ${request.path}`);
    },
  };
}
