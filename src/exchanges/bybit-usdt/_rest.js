const qs = require('qs');
const crypto = require('crypto');
const moment = require('moment');
const Request = require('../../_shared-classes/request');
/**
 * 
 * 
 * 
 * =================================
 * HELPER FUNCTIONS
 * =================================
 * 
 * 
 * 
 */
/**
 * @param {import('../../../typings/_rest').params} params
 * @param {Object | string} responseData 
 * @returns {{ error: import('../../../typings/_rest').RestErrorResponseData<any> }}
 */
 function handleResponseError(params, responseData) {
  /** @type {import('../../../typings/_rest').restErrorResponseDataType} */
  let type = 'unknown';
  if (responseData.retCode) {
    const errorCode = (responseData.retCode).toString();
    switch (errorCode)
    {
      case '110001':
      case '110008':
      case '110009':
      case '110010':
        type = 'order-not-found';
        break;
      case '110004':
      case '110006':
      case '110007':
      case '110012':
      case '110014':
      case '110044':
      case '110052':
      case '110053':
        type = 'insufficient-funds';
        break;
      case '10001':
      case '10002':
      case '10014':
      case '110003':
      case '110017':
        type = 'request-not-accepted';
        break; 
    }
  }
  return {
    error: {
      type: type,
      params: params,
      exchange: responseData,
    }
  }
};
/**
 * @param {number} interval 
 * @returns {string | number}
 */
function getCandleResolution(interval) {
  if (interval === 60000) { return 1 };
  if (interval === 180000) { return 3 };
  if (interval === 300000) { return 5 };
  if (interval === 900000) { return 15 };
  if (interval === 1800000) { return 30 };
  if (interval === 3600000) { return 60 };
  if (interval === 7200000) { return 120 };
  if (interval === 14400000) { return 240 };
  if (interval === 21600000) { return 360 };
  if (interval === 43200000) { return 720 };
  if (interval === 86400000) { return 'D' };
};
/**
 *
 * @param {string} positionSide
 * @param {number} markPx
 * @param {number} availableBalance
 * @param {number} totalPositionIM
 * @param {number} totalOrderIM
 * @param {number} totalPositionMM
 * @param {number} positionSize
 * 
 */
 function calcLiquidationPrice(positionSide, markPx, availableBalance, totalPositionIM, totalOrderIM, totalPositionMM, positionSize) {
  // Calculate liquidation
  // LiqPx (Long) = MP - (AB+IM+OM-MM)/EPS
  // LiqPx (Short) = MP+(AB+IM+OM-MM)/EPS
  let liquidationPrice = 0;
  if (positionSide === 'Buy'){
    liquidationPrice = (markPx - (availableBalance+totalPositionIM+totalOrderIM-totalPositionMM)/positionSize)
  }
  if (positionSide === 'Sell'){
    liquidationPrice = (markPx + (availableBalance+totalPositionIM+totalOrderIM-totalPositionMM)/positionSize)
  }
  liquidationPrice = liquidationPrice < 0 ? 0 : liquidationPrice
  return liquidationPrice;
};
/**
 * 
 * 
 * 
 * =================================
 * REQUEST FUNCTIONS
 * =================================
 * 
 * 
 * 
 */
/**
 * @param {import('../../../typings/_rest').restSettings} restSettings 
 */
function getPublicFunction(restSettings) {
  /** 
   * @this {import('../../../typings/_rest').Request} 
   * @returns {Promise<import('../../../typings/_rest').requestSendReturn>}
   */
  async function public(method, path, data) {
    const dataStringified = qs.stringify(data);
    const requestSendParams = {
      url: `${restSettings.URL}${path}?${dataStringified}`,
      method: method,
    };
    const response = await this.send(requestSendParams);
    return response;
  };
  return public;
};
/**
 * @param {import('../../../typings/_rest').restSettings} restSettings 
 */
function getPrivateFunction(restSettings) {
  /** 
   * @this {import('../../../typings/_rest').Request} 
   * @returns {Promise<import('../../../typings/_rest').requestSendReturn>}
   */
  async function private(method, path, data) {
    const privateData = {};
    privateData.api_key = restSettings.API_KEY;
    privateData.timestamp = Date.now().toString();
    privateData.recv_window = 5000;
    const queryString = method === 'GET' ? qs.stringify(data) : JSON.stringify(data);
    const paramString = `${privateData.timestamp}${privateData.api_key}${privateData.recv_window}${queryString}`;
    const signature = crypto.createHmac('sha256', restSettings.API_SECRET).update(paramString).digest('hex');
    const requestSendParams = {
      url: method === 'POST'? `${restSettings.URL}${path}` : `${restSettings.URL}${path}?${queryString}`,
      headers: {
        'X-BAPI-SIGN-TYPE': '2', 
        'X-BAPI-SIGN': signature, 
        'X-BAPI-API-KEY': privateData.api_key, 
        'X-BAPI-TIMESTAMP': privateData.timestamp, 
        'X-BAPI-RECV-WINDOW': privateData.recv_window, 
        'Content-Type': 'application/json; charset=utf-8'
      },
      method: method,
      data: method === 'POST' ? queryString : '',
    };
    const response = await this.send(requestSendParams);
    return response;
  };
  return private;
};
/**
 * 
 * 
 * 
 * =================================
 * REST DEFINITION
 * =================================
 * 
 * 
 * 
 */
/** 
 * @param {import('../../../typings/_rest').restSettings} restSettings
 */
function Rest(restSettings = {}) {
  // Default rest restSettings values
  restSettings.URL = restSettings.URL || 'https://api.bybit.com';
  restSettings.REQUESTS_REFILL = restSettings.REQUESTS_REFILL || false;
  restSettings.REQUESTS_REFILL_LIMIT = restSettings.REQUESTS_REFILL_LIMIT || 50;
  restSettings.REQUESTS_REFILL_AMOUNT = restSettings.REQUESTS_REFILL_AMOUNT || 50;
  restSettings.REQUESTS_REFILL_INTERVAL = restSettings.REQUESTS_REFILL_INTERVAL || 5000;
  restSettings.REQUESTS_TIMESTAMPS = restSettings.REQUESTS_TIMESTAMPS || 10;
  // Request creation
  const REST_SETTINGS = restSettings;
  const PUBLIC = getPublicFunction(restSettings);
  const PRIVATE = getPrivateFunction(restSettings);
  const request = Request({ REST_SETTINGS, PUBLIC, PRIVATE });
  /** 
   * 
   * 
   * @type {import('../../../typings/_rest').Rest} 
   * 
   * 
   */
  const rest = {
    /**
     * 
     * 
     * REQUEST
     * 
     * 
     */
    request: request,
    /**
     * 
     * 
     * CREATE ORDER
     * 
     * 
     */
    createOrder: async (params) => {
      const data = {};
      data.category = 'linear';
      data.symbol = params.symbol;
      data.side = params.side === 'sell' ? 'Sell' : 'Buy';
      data.qty = params.quantity.toString();
      data.orderLinkId = params.id;
      if (params.type === 'market') {
        data.orderType = 'Market';
        data.timeInForce = 'ImmediateOrCancel';
      }
      if (params.type === 'limit') {
        data.price = params.price.toString();
        data.orderType = 'Limit';
        data.timeInForce = 'GoodTillCancel';
      }
      if (params.type === 'post-only') {
        data.price = params.price.toString();
        data.orderType = 'Limit';
        data.timeInForce = 'PostOnly';
      }
      if (params.type === 'immidiate-or-cancel') {
        data.price = params.price.toString();
        data.orderType = 'Limit';
        data.timeInForce = 'ImmediateOrCancel';
      }
      const response = await request.private('POST', '/unified/v3/private/order/create', data);
      if (+response.data.retCode || response.status >= 400) {
        return handleResponseError(params, response.data);
      }
      return { data: params };
    },
    /**
     * 
     * 
     * CREATE ORDERS
     * 
     * 
     */
    createOrders: (params) => Promise.all(params.map(v => rest.createOrder(v))),
    /**
     * 
     * 
     * CANCEL ORDER
     * 
     * 
     */
    cancelOrder: async (params) => {
      const data = {};
      data.category = 'linear';
      data.symbol = params.symbol;
      data.orderLinkId = params.id;
      const response = await request.private('POST', '/unified/v3/private/order/cancel', data);
      if (+response.data.retCode || response.status >= 400) {
        return handleResponseError(params, response.data);
      }
      return { data: params };
    },
    /**
     * 
     * 
     * CANCEL ORDERS
     * 
     * 
     */
    cancelOrders: (params) => Promise.all(params.map(v => rest.cancelOrder(v))),
    /**
     * 
     * 
     * CANCEL ORDERS ALL
     * 
     * 
     */
    cancelOrdersAll: async (params) => {
      const data = {};
      data.category = 'linear';
      data.symbol = params.symbol;
      const response = await request.private('POST', '/unified/v3/private/order/cancel-all', data);
      if ((+response.data.retCode && response.data.retMsg !== 'Cancel All No Result') || response.status >= 400) {
        return handleResponseError(params, response.data);
      }
      return { data: params };
    },
    /**
     * 
     * 
     * UPDATE ORDER
     * 
     * 
     */
    updateOrder: async (params) => {
      const data = {};
      data.category = 'linear';
      data.symbol = params.symbol;
      data.orderLinkId = params.id;
      if (params.price) {
        data.price = params.price.toString();
      }
      if (params.quantity) {
        data.qty = params.quantity.toString();
      }
      const response = await request.private('POST', '/unified/v3/private/order/replace', data);
      if ((+response.data.retCode) || response.status >= 400) {
        return handleResponseError(params, response.data);
      }
      return { data: params };
    },
    /**
     * 
     * 
     * UPDATE ORDERS
     * 
     * 
     */
    updateOrders: (params) => Promise.all(params.map(v => rest.updateOrder(v))),
    /**
     * 
     * 
     * GET EQUITY
     * 
     * 
     */
    getEquity: async (params) => {
      const data = {};
      data.coin = params.asset;
      const response = await request.private('GET', '/unified/v3/private/account/wallet/balance', data);
      if (+response.data.retCode || response.status >= 400) {
        return handleResponseError(params, response.data);
      }
      const equity = Math.abs(response.data.result.coin[0].equity);
      return { data: equity };
    },
    /**
     * 
     * 
     * GET CANDLES
     * 
     * 
     */
    getCandles: async (params) => {
      const data = {};
      data.category = 'linear';
      data.symbol = params.symbol;
      data.interval = getCandleResolution(params.interval);
      data.limit = 200;
      data.end = moment.utc(params.start).unix()*1000;
      data.start = moment.utc(params.start).subtract(data.limit, 'minutes').unix()*1000;
      const response = await request.public('GET', '/derivatives/v3/public/kline', data);
      if (+response.data.retCode || response.status >= 400) {
        return handleResponseError(params, response.data);
      }
      const candles = response.data.result.list.map(v => {
        const candle = {};
        candle.timestamp = moment.unix(v[0]/1000).utc().format('YYYY-MM-DD HH:mm:ss');
        candle.open = +v[1];
        candle.high = +v[2];
        candle.low = +v[3];
        candle.close = +v[4];
        candle.volume = +v[5];
        return candle;
      });
      return { data: candles };
    },
    /**
     * 
     * 
     * GET POSITION
     * 
     * 
     */
    getPosition: async (params) => {
      const data = {};
      data.category = 'linear';
      data.symbol = params.symbol;
      const response = await request.private('GET', '/unified/v3/private/position/list', data);
      if (+response.data.retCode || response.status >= 400) {
        return handleResponseError(params, response.data);
      }
      const positionResult = response.data.result.list.find(v => v.symbol === params.symbol);
      const qtyS = positionResult && positionResult.side === 'Sell' ? Math.abs(+positionResult.size) : 0;
      const qtyB = positionResult && positionResult.side === 'Buy' ? +positionResult.size : 0;
      const pxS = positionResult && positionResult.side === 'Sell' ? +positionResult.entryPrice : 0;
      const pxB = positionResult && positionResult.side === 'Buy' ? +positionResult.entryPrice : 0;
      const position = { qtyS, qtyB, pxS, pxB };
      return { data: position };
    },
    /**
     * 
     * 
     * GET LAST PRICE
     * 
     * 
     */
    getLastPrice: async (params) => {
      const data = {};
      data.symbol = params.symbol;
      data.category = 'linear';
      const response = await request.public('GET', '/derivatives/v3/public/tickers', data);
      if (+response.data.retCode || response.status >= 400) {
        return handleResponseError(params, response.data);
      }
      const price = +response.data.result.list[0].lastPrice;
      return { data: price };
    },
    /**
     * 
     * 
     * GET LIQUIDATION
     * 
     * 
     */
    getLiquidation: async (params) => {

      const markPriceData = {};
      markPriceData.category = 'linear';
      markPriceData.symbol = params.symbol;
      markPriceData.interval = getCandleResolution(60000);
      markPriceData.limit = 1;
      markPriceData.end = moment.utc(Date.now()).unix()*1000;
      markPriceData.start = moment.utc(Date.now()).subtract(1, 'minutes').unix()*1000;
      const markPriceResponse = await request.public('GET', '/derivatives/v3/public/kline', markPriceData);
      if (+markPriceResponse.data.retCode || markPriceResponse.status >= 400) {
        return handleResponseError(params, markPriceResponse.data);
      }

      let markPx = +markPriceResponse.data.result.list[0][4]


      // Get account equity
      const equityData = {};
      equityData.coin = params.asset;
      const equityResponse = await request.private('GET', '/unified/v3/private/account/wallet/balance', equityData);
      if (+equityResponse.data.retCode || equityResponse.status >= 400) {
        return handleResponseError(params, equityResponse.data);
      }

      const availableBalance = +equityResponse.data.result.coin[0].availableBalance;
      const totalPositionIM = +equityResponse.data.result.coin[0].totalPositionIM;
      const totalPositionMM = +equityResponse.data.result.coin[0].totalPositionMM;
      const totalOrderIM = +equityResponse.data.result.coin[0].totalOrderIM;

      // Get position
      const positionData = {};
      positionData.category = 'linear';
      positionData.symbol = params.symbol;
      const positionResponse = await request.private('GET', '/unified/v3/private/position/list', positionData);
      if (+positionResponse.data.retCode || positionResponse.status >= 400) {
        return handleResponseError(params, positionResponse.data);
      }

      let positionSide = '';
      let positionSize = 0;

      if(positionResponse.data.result.list.length){
        positionSide = positionResponse.data.result.list[0].side;
        positionSize = Math.abs(positionResponse.data.result.list[0].size);
      }

      const liquidationPrice = positionSize ? calcLiquidationPrice(positionSide, markPx, availableBalance, totalPositionIM, totalOrderIM, totalPositionMM, positionSize) : 0;

      const liqPxS = positionSide === 'Sell' ? +liquidationPrice : 0;
      const liqPxB = positionSide === 'Buy' ? +liquidationPrice : 0;
      const liquidation = { markPx, liqPxS, liqPxB, };
      return { data: liquidation };
    },
    /**
     * 
     * 
     * GET FUNDING RATES
     * 
     * 
     */
    getFundingRates: async (params) => {
      const data = {};
      data.symbol = params.symbol;
      data.category = 'linear';
      const response = await request.public('GET', '/derivatives/v3/public/tickers', data);
      if (+response.data.retCode || response.status >= 400) {
        return handleResponseError(params, response.data);
      }
      const current = +response.data.result.list[0].fundingRate;
      const estimated = +response.data.result.list[0].fundingRate;
      const fundings = { current, estimated};
      return { data: fundings };
    },
    /**
     * 
     * 
     * GET MARK PRICES OPTION
     * 
     * 
     */
    getMarkPricesOption: null,
    /**
     * 
     * 
     * GET INSTRUMENTS SYMBOLS
     * 
     * 
     */
    getInstrumentsSymbols: async () => {
      const data = {};
      data.category = 'linear';
      const response = await request.public('GET', '/derivatives/v3/public/instruments-info', data);
      if (+response.data.retCode || response.status >= 400) {
        return handleResponseError(null, response.data);
      }
      const symbols = response.data.result.list.map(v => v.symbol);
      return { data: symbols };
    },
  };
  return rest;
};
module.exports = Rest;
