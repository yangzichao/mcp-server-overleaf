export interface McpServerLaunchSpecification {
  readonly serverName: string;
  readonly command: string;
  readonly args: readonly string[];
}

export interface ClientRegistrationOutcome {
  /** Where the registration landed, in words the user can check themselves. */
  readonly detail: string;
  readonly restartRequired: boolean;
}

export interface McpClientTarget {
  readonly id: string;
  readonly displayName: string;
  isAvailable(): Promise<boolean>;
  isAlreadyRegistered(serverName: string): Promise<boolean>;
  register(launch: McpServerLaunchSpecification): Promise<ClientRegistrationOutcome>;
}
