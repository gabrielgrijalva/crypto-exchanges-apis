
declare namespace WsN {
  import * as Events from 'events';
  /**
   * 
   * 
   * 
   * WS OPTIONS
   * 
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
   * 
   * WS ORDERS
   * 
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
    emit(event: 'executions', data: dataExecutions);
    emit(event: 'cancelations', data: dataCancelations);
    emit(event: 'creations-updates', data: dataCreationsUpdates);
    // On 'event' functions
    on(event: 'executions', listener: (data: dataExecutions) => void);
    on(event: 'cancelations', listener: (data: dataCancelations) => void);
    on(event: 'creations-updates', listener: (data: dataCreationsUpdates) => void);
  }
  type ordersPromiseReturn = { events: ordersEventEmitter };
  /**
   * 
   * 
   * 
   * WS POSITION
   * 
   * 
   * 
   */
  type positionParams = {
    symbol: string;
  }
  type dataPosition = {
    pxS: number;
    pxB: number;
    qtyS: number;
    qtyB: number;
  }
  type positionEventEmitter = Events.EventEmitter & {
    // Emit 'event' functions
    emit(event: 'update', data: dataPosition);
    // On 'event' functions
    on(event: 'update', listener: (data: dataPosition) => void);
  }
  type positionPromiseReturn = { info: dataPosition, events: positionEventEmitter };
  /**
   * 
   * 
   * 
   * WS LIQUIDATION
   * 
   * 
   * 
   */
  type liquidationParams = {
    asset: string;
    symbol: string;
  }
  type dataLiquidation = dataPosition & {
    markPx: number;
    liqPxS: number;
    liqPxB: number;
  }
  type liquidationEventEmitter = Events.EventEmitter & {
    // Emit 'event' functions
    emit(event: 'update', data: dataLiquidation);
    // On 'event' functions
    on(event: 'update', listener: (data: dataLiquidation) => void);
  }
  /**
   * 
   * 
   * 
   * WS ORDER BOOK
   * 
   * 
   * 
   */
  type orderBookParams = {
    symbol: string;
  };
  /**
   * 
   * 
   * 
   * ORDER BOOK INTERFACE
   * 
   * 
   * 
   */
  type orderBookOrder = { price: number, quantity: number };
  type dataOrderBook = {
    // Public data
    asks: orderBookOrder[];
    bids: orderBookOrder[];
    getFirstAsk(): orderBookOrder;
    getFirstBid(): orderBookOrder;
    // Private data
    _updateOrderAsk(update: orderBookOrder): void;
    _updateOrderBid(update: orderBookOrder): void;
    _insertSnapshotAsks(snapshot: orderBookOrder[]): void;
    _insertSnapshotBids(snapshot: orderBookOrder[]): void;
  };
  /**
   * 
   * 
   * 
   * WEBSOCKET INTERFACE
   * 
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
   * 
   * WS INTERFACE
   * 
   * 
   * 
   */
  interface Ws {
    orders(params: ordersParams): Promise<{ events: ordersEventEmitter }>;
    position(params: positionParams): Promise<{ info: dataPosition, events: positionEventEmitter }>;
    liquidation(params: liquidationParams): Promise<{ info: dataLiquidation, events: liquidationEventEmitter }>;
    orderBook(params: orderBookParams): Promise<{ info: dataOrderBook, }>;
  }

}
