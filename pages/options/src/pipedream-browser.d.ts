declare module '@pipedream/sdk/browser' {
  interface FrontendClientOpts {
    externalUserId: string;
    tokenCallback: () => Promise<{ token: string; expiresAt: string }>;
    token?: string;
    frontendHost?: string;
  }

  interface ConnectAccountOptions {
    app: string;
    token?: string;
    onSuccess?: (account: { id: string }) => void;
    onError?: (error: Error) => void;
    onClose?: (status: { successful: boolean; completed: boolean }) => void;
  }

  interface FrontendClient {
    connectAccount(options: ConnectAccountOptions): Promise<void>;
  }

  export function createFrontendClient(opts: FrontendClientOpts): FrontendClient;
}
