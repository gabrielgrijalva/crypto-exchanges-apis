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
    ASSET?: string;
    ASSET_SPOT?: string;
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
    type: 'limit' | 'market' | 'post-only' | 'immidiate-or-cancel';
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
  type getEquityAndPnlParams = {
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
  type _getConnectionTokenParams = {
    type: string;
  }
  type _activateSubAccountParams = {
    uid: string;
    auth: number;
  }
  type params = createOrderParams | createOrdersParams | cancelOrderParams | cancelOrdersParams | cancelOrdersAllParams | updateOrderParams | updateOrdersParams | getEquityParams
    | getCandlesParams | getPositionParams | getLastPriceParams | getLiquidationParams | getFundingRatesParams | getMarkPricesOptionParams | _getOrderBookParams | _getConnectionTokenParams | _activateSubAccountParams | null;
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
  type cancelOrderResponseData = cancelOrderParams | { successes: any[] };
  type cancelOrdersAllResponseData = cancelOrdersAllParams | { successes: any[] };
  type updateOrderResponseData = updateOrderParams;
  type getEquityResponseData = number;
  type getEquityAndPnlResponseData = {
    equity: number;
    pnl: number;
  }
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
    estimated?: number;
    nextFundingTime?: string;
  };
  type getMarkPricesOptionResponseData = {
    markPriceOption: number;
    markPriceUnderlying: number;
  };
  type getInstrumentsSymbolsResponseData = string[];
  type _getListenKeyResponseData = string;
  type _orderBookOrder = { id: number, price: number, quantity: number };
  type _getOrderBookResponseData = { asks: _orderBookOrder[], bids: _orderBookOrder[], lastUpdateId: number, };
  type _getConnectionTokenData = { instanceServers: any[], token: string };
  type _activateSubAccountData = { errors: any[], successes: any[] };
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
    'request-not-accepted' |
    'immidiate-or-cancel-reject';
  type RestErrorResponseData<T> = {
    type: restErrorResponseDataType;
    params: T;
    exchange: any;
    callingFunction: string;
    other?: any;
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
    requestConsumption?: number;
  }
  type requestSendReturn = {
    data: any;
    status: number;
    headers: any;
  }
  interface Request {
    remaining: number;
    timestamps: any[];
    send(params: requestSendParams): Promise<requestSendReturn>;
    updateRequestLimit(params: number);
    key(method: string, path: string, data: any): Promise<requestSendReturn>;
    public(method: string, path: string, data: any, requestConsumption?: number): Promise<requestSendReturn>;
    private(method: string, path: string, data: any, query?: any, requestConsumption?: number): Promise<requestSendReturn>;
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
    getEquityAndPnl(params: getEquityAndPnlParams): Promise<RestResponse<getEquityAndPnlResponseData>>;
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
    _getConnectionToken?(params: _getConnectionTokenParams): Promise<RestResponse<_getConnectionTokenData>> // kucoin
    _activateSubAccount?(params: _activateSubAccountParams): Promise<RestResponse<_activateSubAccountData>> // huobi-swap
  }
}
export = RestN;
