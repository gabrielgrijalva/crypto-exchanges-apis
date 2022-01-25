import settings = require('../typings/settings');
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
  function send(params: requestSendParams): Promise<requestSendReturn>;
  function key(method: string, path: string, data: any): Promise<requestSendReturn>;
  function public(method: string, path: string, data: any): Promise<requestSendReturn>;
  function private(method: string, path: string, data: any, query?: any): Promise<requestSendReturn>;
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
  type requestSettings = {
    settings: settings,
    key?: key;
    public?: public;
    private?: private;
  }
  interface Request {
    remaining: number;
    timestamps: number[];
    send: send;
    key?: key;
    public?: public;
    private?: private;
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
export = RestN;
