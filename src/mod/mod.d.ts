export interface CommandModule {
  data: any;
  execute: (interaction: any, env: any, executionCtx?: any) => Promise<any>;
}