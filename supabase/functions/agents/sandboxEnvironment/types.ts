/**
 * Type definitions for the E2B SDK
 * 
 * These are custom type definitions since official ones don't exist.
 * Based on the e2b documentation at https://e2b.dev/docs
 */

export namespace E2BTypes {
  export interface Session {
    id: string;
    close: () => Promise<void>;
    
    process: {
      start: (options: ProcessStartOptions) => Promise<Process>;
      run: (options: ProcessRunOptions) => Promise<ProcessResult>;
    };
    
    browser: {
      launch: () => Promise<void>;
      goto: (url: string) => Promise<any>;
      click: (selector: string) => Promise<any>;
      type: (selector: string, text: string) => Promise<any>;
      evaluate: (script: string) => Promise<any>;
      close: () => Promise<void>;
    } | null;
    
    filesystem: {
      write: (path: string, content: string) => Promise<void>;
      read: (path: string) => Promise<string>;
      list: (path: string) => Promise<string[]>;
      remove: (path: string) => Promise<void>;
    };
    
    addFirewallRule: (rule: FirewallRule) => Promise<void>;
    limitResources: (limits: ResourceLimits) => Promise<void>;
  }
  
  export interface Process {
    id: string;
    wait: () => Promise<number>;
    kill: () => Promise<void>;
  }
  
  export interface ProcessStartOptions {
    cmd: string;
    onStdout?: (data: string) => void;
    onStderr?: (data: string) => void;
    env?: Record<string, string>;
    cwd?: string;
  }
  
  export interface ProcessRunOptions {
    cmd: string;
    onStdout?: (data: string) => void;
    onStderr?: (data: string) => void;
    env?: Record<string, string>;
    cwd?: string;
  }
  
  export interface ProcessResult {
    exitCode: number;
    stdout: string;
    stderr: string;
  }
  
  export interface FirewallRule {
    direction: 'ingress' | 'egress';
    protocol: 'tcp' | 'udp';
    port: number;
    allowedHosts: string[];
  }
  
  export interface ResourceLimits {
    cpuCores?: number;
    memoryMB?: number;
    timeoutSec?: number;
  }
  
  export interface SessionOptions {
    template: string;
    envVars?: Record<string, string>;
  }
}

export interface E2BModule {
  startSession: (options: E2BTypes.SessionOptions) => Promise<E2BTypes.Session>;
} 