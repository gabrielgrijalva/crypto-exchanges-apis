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
    WS_ON_MESSAGE_LOGS?: boolean;
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
  type orderBooksSettings = {
    SYMBOL?: string;
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
  type ordersCreationsUpdates = {
    symbol: string;
    event: 'creations-updates';
    id: string;
    side: 'sell' | 'buy';
    price: number;
    quantity: number;
    timestamp: string;
  }
  type ordersExecutions = {
    symbol: string;
    event: 'executions';
    id: string;
    side: 'sell' | 'buy';
    price: number;
    quantity: number;
    timestamp: string;
  }
  type ordersCancelations = {
    symbol: string;
    event: 'cancelations';
    id: string;
    timestamp: string;
  }
  type ordersEventEmitter = Events.EventEmitter & {
    // Emit 'event' functions
    emit(event: 'executions', data: ordersExecutions[]);
    emit(event: 'cancelations', data: ordersCancelations[]);
    emit(event: 'creations-updates', data: ordersCreationsUpdates[]);
    // On 'event' functions
    on(event: 'executions', listener: (data: ordersExecutions[]) => void);
    on(event: 'cancelations', listener: (data: ordersCancelations[]) => void);
    on(event: 'creations-updates', listener: (data: ordersCreationsUpdates[]) => void);
  }
  type ordersWsObject = { subscribe(params: ordersParams): Promise<void>; data: null; events: ordersEventEmitter; subscriptions: ordersParams[] };
  /**
   * 
   * 
   * 
   * WS POSITIONS
   * 
   * 
   * 
   */
  type positionsParams = {
    symbol: string;
  }
  type positionsData = {
    symbol: string;
    pxS: number;
    pxB: number;
    qtyS: number;
    qtyB: number;
  }
  type positionsWsObject = { subscribe(params: positionsParams): Promise<void>; data: positionsData[]; events: null; subscriptions: positionsParams[] };
  /**
   * 
   * 
   * 
   * WS LIQUIDATIONS
   * 
   * 
   * 
   */
  type liquidationsParams = {
    asset: string;
    symbol: string;
  }
  type liquidationsData = (liquidationsParams & positionsData) & {
    markPx: number;
    liqPxS: number;
    liqPxB: number;
  }
  type liquidationsWsObject = { subscribe(params: liquidationsParams): Promise<void>; data: liquidationsData[]; events: null; subscriptions: liquidationsParams[] };
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
  type tradesData = {
    symbol: string;
    side: 'sell' | 'buy';
    price: number;
    quantity: number;
    timestamp: string;
  }
  type tradesEventEmitter = Events.EventEmitter & {
    // Emit 'event' functions
    emit(event: 'trades', data: tradesData[]);
    // On 'event' functions
    on(event: 'trades', listener: (data: tradesData[]) => void);
  }
  type tradesWsObject = { subscribe(params: tradesParams): Promise<void>; data: tradesData[]; events: tradesEventEmitter; subscriptions: tradesParams[] };
  /**
   * 
   * 
   * 
   * WS MARK PRICES OPTIONS
   * 
   * 
   * 
   */
  type markPricesOptionsParams = {
    symbol: string;
  }
  type markPricesOptionsData = {
    symbol: string;
    markPriceOption: number;
    markPriceUnderlying: number;
  }
  type markPricesOptionsWsObject = { subscribe(params: markPricesOptionsParams): Promise<void>; data: markPricesOptionsData[]; events: null; subscriptions: markPricesOptionsParams[] };
  /**
   * 
   * 
   * 
   * ORDER BOOK
   * 
   * 
   * 
   */
  type orderBooksOrder = { id: number, price: number, quantity: number };
  type orderBooksFlags = { synchronizing: boolean, synchronized: boolean, snapshot: null | { asks: orderBooksOrder[], bids: orderBooksOrder[], lastUpdateId: number } };
  type orderBooksParams = { symbol: string; frozenCheckInterval?: number; priceOverlapsCheckInterval?: number; }
  type orderBooksData = {
    symbol: string;
    asks: orderBooksOrder[];
    bids: orderBooksOrder[];
    otherData: any;
    deleteOrderByIdAsk(update: orderBooksOrder): void;
    deleteOrderByIdBid(update: orderBooksOrder): void;
    updateOrderByIdAsk(update: orderBooksOrder): void;
    updateOrderByIdBid(update: orderBooksOrder): void;
    updateOrderByPriceAsk(update: orderBooksOrder): void;
    updateOrderByPriceBid(update: orderBooksOrder): void;
    insertSnapshotAsks(snapshot: orderBooksOrder[]): void;
    insertSnapshotBids(snapshot: orderBooksOrder[]): void;
  };
  type orderBooksWsObject = { subscribe(params: orderBooksParams): Promise<void>; data: orderBooksData[]; events: null; subscriptions: orderBooksParams[] };
  /**
   * 
   * 
   * 
   * ORDER BOOK SERVER
   * 
   * 
   * 
   */
  type orderBooksServerParams = {
    port: number;
    host: string;
    broadcast: number;
  };
  type orderBooksServerWsObject = { create(params: orderBooksServerParams): void; }
  /**
   * 
   * 
   * 
   * ORDER BOOK CLIENT
   * 
   * 
   * 
   */
  type orderBooksClientParams = {
    port: number;
    host: string;
  };
  type orderBooksClientWsObject = { connect(params: orderBooksClientParams): void; };
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
    // Find function listener;
    findOnOpen(listener: () => void): boolean;
    findOnClose(listener: () => void): boolean;
    findOnError(listener: (error: string) => void): boolean;
    findOnMessage(listener: (message: string) => void): boolean;
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
    connect(): Promise<void>;
    orders: ordersWsObject;
    positions: positionsWsObject;
    liquidations: liquidationsWsObject;
    trades: tradesWsObject;
    orderBooks: orderBooksWsObject;
    orderBooksServer: orderBooksServerWsObject;
    orderBooksClient: orderBooksClientWsObject;
    markPricesOptions: markPricesOptionsWsObject;
  }
}
export = WsN;
