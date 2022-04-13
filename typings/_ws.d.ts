/**
 * 
 * 
 * 
 * WSN IMPLEMENTATION
 * 
 * 
 * 
 */
declare namespace WsN {
  import * as Events from 'events';
  /**
   * 
   * 
   * 
   * WS SETTINGS
   * 
   * 
   * 
   */
  type wsSettings = {
    URL?: string;
    API_KEY?: string;
    API_SECRET?: string;
    API_PASSPHRASE?: string;
    WS_SEND_PING_WAIT?: number;
    WS_RECEIVE_PONG_WAIT?: number;
  }
  /**
   * 
   * 
   * 
   * ORDER BOOK SETTINGS
   * 
   * 
   * 
   */
  type orderBookSettings = {
    FROZEN_CHECK_INTERVAL?: number;
    PRICE_OVERLAPS_CHECK_INTERVAL?: number;
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
  type dataCreationsUpdates = {
    event: 'creations-updates';
    id: string;
    side: 'sell' | 'buy';
    price: number;
    quantity: number;
    timestamp: string;
  }
  type dataExecutions = {
    event: 'executions';
    id: string;
    side: 'sell' | 'buy';
    price: number;
    quantity: number;
    timestamp: string;
  }
  type dataCancelations = {
    event: 'cancelations';
    id: string;
    timestamp: string;
  }
  type ordersEventEmitter = Events.EventEmitter & {
    // Emit 'event' functions
    emit(event: 'executions', data: dataExecutions[]);
    emit(event: 'cancelations', data: dataCancelations[]);
    emit(event: 'creations-updates', data: dataCreationsUpdates[]);
    // On 'event' functions
    on(event: 'executions', listener: (data: dataExecutions[]) => void);
    on(event: 'cancelations', listener: (data: dataCancelations[]) => void);
    on(event: 'creations-updates', listener: (data: dataCreationsUpdates[]) => void);
  }
  type ordersWsObjectReturn = { data: null; events: ordersEventEmitter; connect(): Promise<void>; };
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
  type positionWsObjectReturn = { data: dataPosition; events: positionEventEmitter; connect(): Promise<void>; };
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
  type liquidationWsObjectReturn = { data: dataLiquidation; events: liquidationEventEmitter; connect(): Promise<void>; };
  /**
   * 
   * 
   * 
   * WS TRADES
   * 
   * 
   * 
   */
  type tradesParams = {
    symbol: string;
  }
  type dataTrades = {
    side: 'sell' | 'buy';
    price: number;
    quantity: number;
    timestamp: string;
  }
  type tradesEventEmitter = Events.EventEmitter & {
    // Emit 'event' functions
    emit(event: 'update', data: dataTrades[]);
    // On 'event' functions
    on(event: 'update', listener: (data: dataTrades[]) => void);
  }
  type tradesWsObjectReturn = { data: null; events: tradesEventEmitter; connect(): Promise<void>; };
  /**
   * 
   * 
   * 
   * ORDER BOOK INTERFACE
   * 
   * 
   * 
   */
  type flags = { synchronizing: boolean, synchronized: boolean, snapshot: null | { asks: orderBookOrder[], bids: orderBookOrder[], lastUpdateId: number } };
  type orderBookOrder = { id: number, price: number, quantity: number };
  type orderBookClientParams = {
    symbol: string;
    type?: 'client';
    port?: number;
    host?: string;
    frozenCheckInterval?: number;
    priceOverlapsCheckInterval?: number;
  };
  type orderBookServerParams = {
    symbol: string;
    type?: 'server';
    port?: number;
    host?: string;
    broadcast?: number;
    frozenCheckInterval?: number;
    priceOverlapsCheckInterval?: number;
  };
  type orderBookParams = orderBookClientParams | orderBookServerParams;
  type dataOrderBook = {
    // Public data
    asks: orderBookOrder[];
    bids: orderBookOrder[];
    // Private data
    _createServer(params: orderBookServerParams): void;
    _connectClient(webSocket: WebSocket, params: orderBookClientParams): void;
    _deleteOrderByIdAsk(update: orderBookOrder): void;
    _deleteOrderByIdBid(update: orderBookOrder): void;
    _updateOrderByIdAsk(update: orderBookOrder): void;
    _updateOrderByIdBid(update: orderBookOrder): void;
    _updateOrderByPriceAsk(update: orderBookOrder): void;
    _updateOrderByPriceBid(update: orderBookOrder): void;
    _insertSnapshotAsks(snapshot: orderBookOrder[]): void;
    _insertSnapshotBids(snapshot: orderBookOrder[]): void;
  };
  type orderBookWsObjectReturn = { data: dataOrderBook; events: null; connect(): Promise<void>; };
  /**
   * 
   * 
   * 
   * WEBSOCKET INTERFACE
   * 
   * 
   * 
   */
  interface WebSocket {
    // Util functions
    send(data: string): void;
    connect(url: string, options?: Object): void;
    close(): void,
    disconnect(): void;
    // Add function listener;
    addOnOpen(listener: () => void, persistent: boolen): void;
    addOnClose(listener: () => void, persistent: boolen): void;
    addOnError(listener: (error: string) => void, persistent: boolen): void;
    addOnMessage(listener: (message: string) => void, persistent: boolen): void;
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
    getOrders(params: ordersParams): ordersWsObjectReturn;
    getPosition(params: positionParams): positionWsObjectReturn;
    getLiquidation(params: liquidationParams): liquidationWsObjectReturn;
    getTrades(params: tradesParams): tradesWsObjectReturn;
    getOrderBook(params: orderBookParams): orderBookWsObjectReturn;
  }
}
export = WsN;
