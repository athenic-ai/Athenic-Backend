declare module 'express' {
  import * as http from 'http';
  
  export interface Request extends http.IncomingMessage {
    body: any;
    params: any;
    query: any;
  }
  
  export interface Response extends http.ServerResponse {
    json: (body: any) => void;
    status: (code: number) => Response;
    send: (body: any) => void;
  }
  
  export interface NextFunction {
    (err?: any): void;
  }
  
  export interface Express {
    use: (...args: any[]) => void;
    get: (path: string, handler: (req: Request, res: Response, next?: NextFunction) => void) => void;
    post: (path: string, handler: (req: Request, res: Response, next?: NextFunction) => void) => void;
    put: (path: string, handler: (req: Request, res: Response, next?: NextFunction) => void) => void;
    delete: (path: string, handler: (req: Request, res: Response, next?: NextFunction) => void) => void;
    listen: (port: number, callback?: () => void) => http.Server;
  }
  
  function express(): Express;
  
  namespace express {
    export function json(): (req: Request, res: Response, next: NextFunction) => void;
    export function urlencoded(options?: { extended?: boolean }): (req: Request, res: Response, next: NextFunction) => void;
    export function static(root: string, options?: any): (req: Request, res: Response, next: NextFunction) => void;
  }
  
  export default express;
} 