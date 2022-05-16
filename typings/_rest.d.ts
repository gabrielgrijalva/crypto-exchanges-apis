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
   * REST SETTINGS
   * 
   * 
   * 
   */
  type restSettings = {
    URL?: string;
    API_KEY?: string;
    API_SECRET?: string;
    API_PASSPHRASE?: string;
    REQUESTS_REFILL?: boolean;
    REQUESTS_REFILL_LIMIT?: number;
    REQUESTS_REFILL_AMOUNT?: number;
    REQUESTS_REFILL_INTERVAL?: number;
    REQUESTS_TIMESTAMPS?: number;
  }
  /**
   * 
   * 
   * 
   * REQUEST SETTINGS
   * 
   * 
   * 
   */
  type requestSettings = {
    REST_SETTINGS: restSettings;
    KEY?(method: string, path: string, data: any): Promise<requestSendReturn>;
    PUBLIC?(method: string, path: string, data: any): Promise<requestSendReturn>;
    PRIVATE?(method: string, path: string, data: any, query?: any): Promise<requestSendReturn>;
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
    side: string;
    price?: number;
    symbol: string;
    quantity?: number;
  }
  type updateOrdersParams = updateOrderParams[];
  type getEquityParams = {
    asset: string;
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
  type getMarkPricesOptionParams = {
    symbol: string;
  }
  type _getOrderBookParams = {
    symbol: string;
  }
  type params = createOrderParams | createOrdersParams | cancelOrderParams | cancelOrdersParams | cancelOrdersAllParams | updateOrderParams | updateOrdersParams | getEquityParams
    | getCandlesParams | getPositionParams | getLastPriceParams | getLiquidationParams | getFundingRatesParams | getMarkPricesOptionParams | _getOrderBookParams | null;
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
  type getMarkPricesOptionResponseData = {
    markPriceOption: number;
    markPriceUnderlying: number;
  };
  type getInstrumentsSymbolsResponseData = string[];
  type _getListenKeyResponseData = string;
  type _orderBookOrder = { id: number, price: number, quantity: number };
  type _getOrderBookResponseData = { asks: _orderBookOrder[], bids: _orderBookOrder[], lastUpdateId: number, };
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
  type RestErrorResponseData<T> = {
    type: restErrorResponseDataType;
    params: T;
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
    method: string;
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
    send(params: requestSendParams): Promise<requestSendReturn>;
    key(method: string, path: string, data: any): Promise<requestSendReturn>;
    public(method: string, path: string, data: any): Promise<requestSendReturn>;
    private(method: string, path: string, data: any, query?: any): Promise<requestSendReturn>;
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
    error?: RestErrorResponseData<T>;
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
    updateOrder(params: updateOrderParams): Promise<RestResponse<updateOrderResponseData>>;
    updateOrders(params: updateOrdersParams): Promise<RestResponse<updateOrderResponseData>[]>;
    /**
     * INFORMATION FUNCTIONS
     */
    getEquity(params: getEquityParams): Promise<RestResponse<getEquityResponseData>>;
    getCandles(params: getCandlesParams): Promise<RestResponse<getCandlesResponseData>>;
    getPosition(params: getPositionParams): Promise<RestResponse<getPositionResponseData>>;
    getLastPrice(params: getLastPriceParams): Promise<RestResponse<getLastPriceResponseData>>;
    getLiquidation(params: getLiquidationParams): Promise<RestResponse<getLiquidationResponseData>>;
    getFundingRates(params: getFundingRatesParams): Promise<RestResponse<getFundingRatesResponseData>>;
    getMarkPricesOption(params: getMarkPricesOptionParams): Promise<RestResponse<getMarkPricesOptionResponseData>>;
    getInstrumentsSymbols(): Promise<RestResponse<getInstrumentsSymbolsResponseData>>;
    /**
     * CUSTOM EXCHANGE FUNCTIONS
     */
    _getListenKey?(): Promise<RestResponse<_getListenKeyResponseData>> // binance-coin
    _getOrderBook?(params: _getOrderBookParams): Promise<RestResponse<_getOrderBookResponseData>> // binance-coin
  }
}
export = RestN;
