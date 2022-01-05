/**
 * 
 * 
 * 
 * RESTN IMPLEMENTATION
 * 
 * 
 * 
 */
declare namespace RestN {
  /**
   * 
   * 
   * 
   * REST OPTIONS
   * 
   * 
   * 
   */
  type restOptions = {
    url?: string;
    apiKey?: string;
    apiSecret?: string;
    apiPassphrase?: string;
    requestsLimit?: number;
    requestsTimestamps?: number;
    requestsRefill?: number;
    requestsRefillType?: '' | 'discrete' | 'continouos';
    requestsRefillInterval?: number;
  }
  /**
   * 
   * 
   * 
   * REST PARAMS
   * 
   * 
   * 
   */
  type createOrderParams = {
    id: string;
    side: 'sell' | 'buy';
    type: 'limit' | 'market';
    price?: number;
    symbol: string;
    quantity: number;
    direction: 'open' | 'close';
  }
  type createOrdersParams = createOrderParams[];
  type cancelOrderParams = {
    id: string;
    symbol: string;
  }
  type cancelOrdersParams = cancelOrderParams[];
  type cancelOrdersAllParams = {
    symbol: string;
  }
  type updateOrderParams = {
    id: string;
    symbol: string;
    price?: number;
    quantity?: number;
    fQuantity?: number;
  }
  type updateOrdersParams = updateOrderParams[];
  type getEquityParams = {
    asset: string;
    symbol: string;
  }
  type getCandlesParams = {
    start: string;
    symbol: string;
    interval: number;
  }
  type getPositionParams = {
    symbol: string;
  }
  type getLastPriceParams = {
    symbol: string;
  }
  type getLiquidationParams = {
    asset: string;
    symbol: string;
  }
  type getFundingRatesParams = {
    symbol: string;
  }
  type getOrderBookParams = {
    symbol: string;
  }
  type params = cancelOrderParams | cancelOrdersAllParams | updateOrderParams | getEquityParams | createOrderParams | getPositionParams
    | getLastPriceParams | getLiquidationParams | getFundingRatesParams | updateOrdersParams | cancelOrdersParams | createOrdersParams | getOrderBookParams | null;
  /**
   * 
   * 
   * 
   * REST RESPONSE
   * 
   * 
   * 
   */
  type createOrderResponseData = createOrderParams;
  type cancelOrderResponseData = cancelOrderParams;
  type cancelOrdersAllResponseData = cancelOrdersAllParams;
  type updateOrderResponseData = updateOrderParams;
  type getEquityResponseData = number;
  type getCandlesResponseData = {
    timestamp: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }[];
  type getPositionResponseData = {
    pxS: number;
    pxB: number;
    qtyS: number;
    qtyB: number;
  };
  type getLastPriceResponseData = number;
  type getLiquidationResponseData = {
    markPx: number;
    liqPxS: number;
    liqPxB: number;
  };
  type getFundingRatesResponseData = {
    current: number;
    estimated: number;
  };
  type getListenKeyResponseData = string;
  type orderBookOrder = { id: number, price: number, quantity: number };
  type getOrderBookResponseData = { asks: orderBookOrder[], bids: orderBookOrder[], lastUpdateId: number, };
  /**
   * 
   * 
   * 
   * REST ERROR RESPONSE
   * 
   * 
   * 
   */
  type restErrorResponseDataType =
    'unknown' |
    'no-function' |
    'api-rate-limit' |
    'request-timeout' |
    'order-not-found' |
    'post-only-reject' |
    'insufficient-funds' |
    'request-not-accepted';
  type RestErrorResponseData = {
    type: restErrorResponseDataType;
    params: params;
    exchange: any;
  }
  /**
   * 
   * 
   * 
   * REQUEST INTERFACE
   * 
   * 
   * 
   */
  type requestOptions = {
    restOptions: restOptions,
    key?(method: string, path: string, data: any): Promise<requestSendReturn>;
    public?(method: string, path: string, data: any): Promise<requestSendReturn>;
    private?(method: string, path: string, data: any, query?: any): Promise<requestSendReturn>;
  }
  type requestSendParams = {
    url: string;
    data?: string;
    method: string,
    headers?: any;
  }
  type requestSendReturn = {
    data: any;
    status: number;
    headers: any;
  }
  interface Request {
    remaining: number;
    timestamps: number[];
    restOptions: restOptions;
    send(params: requestSendParams): Promise<requestSendReturn>;
    key?(method: string, path: string, data: any): Promise<requestSendReturn>;
    public?(method: string, path: string, data: any): Promise<requestSendReturn>;
    private?(method: string, path: string, data: any, query?: any): Promise<requestSendReturn>;
  }
  /**
   * 
   * 
   * 
   * REST INTERFACE
   * 
   * 
   * 
   */
  type RestResponse<T> = {
    data?: T;
    error?: RestErrorResponseData;
  }
  export interface Rest {
    request: Request;
    /**
     * CREATE FUNCTIONS
     */
    createOrder(params: createOrderParams): Promise<RestResponse<createOrderResponseData>>;
    createOrders(params: createOrdersParams): Promise<RestResponse<createOrderResponseData>[]>;
    /**
     * CANCEL FUNCTIONS
     */
    cancelOrder(params: cancelOrderParams): Promise<RestResponse<cancelOrderResponseData>>;
    cancelOrders(params: cancelOrdersParams): Promise<RestResponse<cancelOrderResponseData>[]>;
    cancelOrdersAll(params: cancelOrdersAllParams): Promise<RestResponse<cancelOrdersAllResponseData>>;
    /**
     * UPDATE FUNCTIONS
     */
    updateOrder?(params: updateOrderParams): Promise<RestResponse<updateOrderResponseData>>;
    updateOrders?(params: updateOrdersParams): Promise<RestResponse<updateOrderResponseData>[]>;
    /**
     * INFORMATION FUNCTIONS
     */
    getEquity(params: getEquityParams): Promise<RestResponse<getEquityResponseData>>;
    getCandles(params: getCandlesParams): Promise<RestResponse<getCandlesResponseData>>;
    getPosition(params: getPositionParams): Promise<RestResponse<getPositionResponseData>>;
    getLastPrice(params: getLastPriceParams): Promise<RestResponse<getLastPriceResponseData>>;
    getLiquidation(params: getLiquidationParams): Promise<RestResponse<getLiquidationResponseData>>;
    getFundingRates(params: getFundingRatesParams): Promise<RestResponse<getFundingRatesResponseData>>;
    /**
     * CUSTOM EXCHANGE FUNCTIONS
     */
    _getListenKey?(): Promise<RestResponse<getListenKeyResponseData>> // binance-coin
    _getOrderBook?(params: getOrderBookParams): Promise<RestResponse<getOrderBookResponseData>> // binance-coint
  }
}
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
  }[]
  type dataCancelations = {
    id: string;
  }[]
  type dataCreationsUpdates = {
    id: string;
    side: 'sell' | 'buy';
    price: number;
    quantity: number;
  }[]
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
   * WS SERVER
   * 
   * 
   * 
   */
  type serverParams = {
    port: number,
    host: string,
    broadcast: number,
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
  type flags = { synchronizing: boolean, synchronized: boolean, snapshot: null | { asks: orderBookOrder[], bids: orderBookOrder[], lastUpdateId: number } };
  type orderBookOrder = { id: number, price: number, quantity: number };
  type dataOrderBook = {
    // Public data
    asks: orderBookOrder[];
    bids: orderBookOrder[];
    getFirstAsk(): orderBookOrder;
    getFirstBid(): orderBookOrder;
    createServer(params: serverParams): void;
    // Private data
    _deleteOrderByIdAsk(update: orderBookOrder): void;
    _deleteOrderByIdBid(update: orderBookOrder): void;
    _updateOrderByIdAsk(update: orderBookOrder): void;
    _updateOrderByIdBid(update: orderBookOrder): void;
    _updateOrderByPriceAsk(update: orderBookOrder): void;
    _updateOrderByPriceBid(update: orderBookOrder): void;
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
  type wsReturnPromise<I, E, P> = {
    info: I, events: E, connect(params: P): Promise<void>,
  }
  interface Ws {
    orders: wsReturnPromise<null, ordersEventEmitter, ordersParams>;
    position: wsReturnPromise<dataPosition, positionEventEmitter, positionParams>;
    liquidation: wsReturnPromise<dataLiquidation, liquidationEventEmitter, liquidationParams>;
    orderBook: wsReturnPromise<dataOrderBook, null, orderBookParams>;
  }
}
/**
 * 
 * 
 * 
 * POPULATORN IMPLEMENTATION
 * 
 * 
 * 
 */
declare namespace PopulatorN {
  /**
   * 
   * 
   * 
   * POPULATOR OPTIONS
   * 
   * 
   * 
   */
  type populatorOptions = {
    port?: number,
    host?: string,
    user?: string,
    database?: string,
    password?: string,
    timezone?: string,
  }
  /**
   * 
   * 
   * 
   * POPULATOR PARAMS
   * 
   * 
   * 
   */
  type candlesParams = {
    table: string,
    symbol: string,
    interval: number,
    start: string,
    finish: string,
    waitRequest: number;
  };
  type candlesCronParams = {
    table: string,
    symbol: string,
    interval: number,
  };
  /**
   * 
   * 
   * 
   * POPULATOR INTERFACE
   * 
   * 
   * 
   */
  interface Populator {
    candles(params: candlesParams): Promise<void>;
    candlesCron(params: candlesCronParams): void;
  };
}
/**
 * 
 * 
 * 
 * UTILSN IMPLEMENTATION
 * 
 * 
 * 
 */
declare namespace UtilsN {
  /**
   * 
   * 
   * 
   * UTILS OPTIONS
   * 
   * 
   * 
   */
  type utilsOptions = {
    symbol?: string;
  }
  /**
   * 
   * 
   * 
   * UTILS INTERFACE
   * 
   * 
   * 
   */
  interface Utils {
    getOrderId(): string;
  }
}
/**
 * 
 * 
 * 
 * EXCHANGEN IMPLEMENTATION
 * 
 * 
 * 
 */
declare namespace ExchangeN {
  interface Exchange {
    Populator(options: PopulatorN.populatorOptions): PopulatorN.Populator;
    Rest(options: RestN.restOptions): RestN.Rest;
    Utils(options: UtilsN.utilsOptions): UtilsN.Utils;
    Ws(options: WsN.wsOptions): WsN.Ws;
  }
}
/**
 * 
 * 
 * 
 * EXPORTS IMPLEMENTATION
 * 
 * 
 * 
 */
export const BinanceCoin: ExchangeN.Exchange;
export const Bitmex: ExchangeN.Exchange;
export const Bybit: ExchangeN.Exchange;
export const BybitFutures: ExchangeN.Exchange;
export const Deribit: ExchangeN.Exchange;
export const KrakenFutures: ExchangeN.Exchange;
export const Okex: ExchangeN.Exchange;
