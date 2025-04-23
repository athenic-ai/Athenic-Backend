// This file declares the Jest global variables for TypeScript
import { jest } from '@jest/globals';

declare global {
  const jest: typeof jest;
  
  // Expose other Jest globals if needed
  namespace jest {
    interface Mock<T = any, Y extends any[] = any> {
      (...args: Y): T;
      mockImplementation(fn: (...args: Y) => T): this;
      mockImplementationOnce(fn: (...args: Y) => T): this;
      mockReturnValue(value: T): this;
      mockReturnValueOnce(value: T): this;
      mockResolvedValue(value: T): this;
      mockResolvedValueOnce(value: T): this;
      mockRejectedValue(value: any): this;
      mockRejectedValueOnce(value: any): this;
      mockClear(): this;
      mockReset(): this;
      mockRestore(): this;
    }
    
    function fn<T = any, Y extends any[] = any>(): Mock<T, Y>;
    function fn<T = any, Y extends any[] = any>(implementation: (...args: Y) => T): Mock<T, Y>;
    
    function clearAllMocks(): void;
    function resetAllMocks(): void;
    function restoreAllMocks(): void;
    
    function mock(moduleName: string, factory?: any, options?: any): any;
  }
} 