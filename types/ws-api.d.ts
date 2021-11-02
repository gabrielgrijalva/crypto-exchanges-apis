
declare namespace WsApi {
  import * as Events from 'events';
  /**
   * 
   * 
   * WS OPTIONS
   * 
   * 
   */
  type wsOptions = {
    url?: string;
    apiKey?: string;
    apiSecret?: string;
    apiPassphrase?: string;
  }
  /**
   * 
   * 
   * WS ORDERS
   * 
   * 
   */
  type ordersParams = {
    symbol: string;
  }
  type dataExecutions = {
    id: string;
    side: 'sell' | 'buy';
    price: number;
    quantity: number;
    timestamp: string;
  }[];
  type dataCancelations = {
    id: string;
  }[];
  type dataCreationsUpdates = {
    id: string;
    side: 'sell' | 'buy';
    price: number;
    quantity: number;
  }[];
  type ordersEventEmitter = Events.EventEmitter & {
    // Emit 'event' functions
    emit(event: 'executions', dataExecutions);
    emit(event: 'cancelations', dataCancelations);
    emit(event: 'creations-updates', dataCreationsUpdates);
    // On 'event' functions
    on(event: 'executions', listener: (data: dataExecutions) => void);
    on(event: 'cancelations', listener: (data: dataCancelations) => void);
    on(event: 'creations-updates', listener: (data: dataCreationsUpdates) => void);
  }
  /**
   * 
   * 
   * WEBSOCKET INTERFACE
   * 
   * 
   */
  type webSocketOptions = {
    url: string;
  }
  interface WebSocket {
    // Util functions
    send(data: string): void;
    connect(url: string, options?: Object): void;
    disconnect(): void;
    // Add function listener;
    addOnOpen(listener: () => void): void;
    addOnClose(listener: () => void): void;
    addOnError(listener: (error: string) => void): void;
    addOnMessage(listener: (message: string) => void): void;
    // Remove function listener;
    removeOnOpen(listener: () => void): void;
    removeOnClose(listener: () => void): void;
    removeOnError(listener: (error: string) => void): void;
    removeOnMessage(listener: (message: string) => void): void;
  }
  /**
   * 
   * 
   * WS INTERFACE
   * 
   * 
   */
  interface Ws {
    orders(params: ordersParams): ordersEventEmitter;
  }

}
