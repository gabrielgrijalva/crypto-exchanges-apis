const Flatted = require('flatted');
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
 * @param {string} callingFunction
 * @returns {{ error: import('../../../typings/_rest').RestErrorResponseData<any> }}
 */
function handleResponseError(params, responseData, callingFunction) {
  /** @type {import('../../../typings/_rest').restErrorResponseDataType} */
  let type = 'unknown';
  if (+responseData.ret_code !== 0) {
    if (+responseData.ret_code === 30076) {
      type = 'no-function';
    }
    if (+responseData.ret_code === 20001 || +responseData.ret_code === 30032
      || +responseData.ret_code === 30034 || +responseData.ret_code === 30037
      || +responseData.ret_code === 20001 || +responseData.ret_code === 30032) {
      type = 'order-not-found';
    }
    if (+responseData.ret_code === 10006 || +responseData.ret_code === 10018) {
      type = 'api-rate-limit';
    }
    if (+responseData.ret_code === 10002) {
      type = 'request-not-accepted';
    }
    if (+responseData.ret_code === 30010 || +responseData.ret_code === 30031
      || +responseData.ret_code === 30049) {
      type = 'insufficient-funds';
    }
  }
  if (responseData.code === 'ETIMEDOUT' || responseData.code === 'ESOCKETTIMEDOUT') {
    type = 'request-timeout';
  }
  return {
    error: {
      callingFunction,
      type: type,
      params: Flatted.stringify(params),
      exchange: Flatted.stringify(responseData),
    }
  }
};
function orderAndStringifyData(params) {
  let orderedParams = '';
  Object.keys(params).sort().forEach(function (key) {
    orderedParams += key + "=" + params[key] + "&";
  });
  orderedParams = orderedParams.substring(0, orderedParams.length - 1);
  return orderedParams;
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
 * @param {string} symbol 
 */
function getBasePath(symbol) {
  return !/\d/.test(symbol) ? 'v2' : 'futures';
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
    privateData.timestamp = Date.now();
    const preSignatureData = Object.assign(data, privateData);
    const signature = crypto.createHmac('sha256', restSettings.API_SECRET)
      .update(orderAndStringifyData(preSignatureData)).digest('hex');
    const signatureData = Object.assign(preSignatureData, { sign: signature });
    const signatureDatStringify = qs.stringify(signatureData);
    const requestSendParams = {
      url: `${restSettings.URL}${path}?${signatureDatStringify}`,
      method: method,
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
      data.qty = params.quantity;
      data.side = params.side === 'sell' ? 'Sell' : 'Buy';
      data.symbol = params.symbol;
      data.order_link_id = params.id;
      if (params.type === 'limit') {
        data.price = params.price;
        data.order_type = 'Limit';
        data.time_in_force = 'GoodTillCancel';
      }
      if (params.type === 'market') {
        data.order_type = 'Market';
        data.time_in_force = 'ImmediateOrCancel';
      }
      if (params.type === 'post-only') {
        data.price = params.price;
        data.order_type = 'Limit';
        data.time_in_force = 'PostOnly';
      }
      if (params.type === 'immidiate-or-cancel') {
        data.price = params.price;
        data.order_type = 'Limit';
        data.time_in_force = 'ImmediateOrCancel';
      }
      const basePath = getBasePath(params.symbol);
      const response = await request.private('POST', `/${basePath}/private/order/create`, data);
      if (+response.data.ret_code !== 0 || response.status >= 400) {
        return handleResponseError(params, response.data, 'createOrder');
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
      data.symbol = params.symbol;
      data.order_link_id = params.id;
      const basePath = getBasePath(params.symbol);
      const response = await request.private('POST', `/${basePath}/private/order/cancel`, data);
      if (+response.data.ret_code !== 0 || response.status >= 400) {
        return handleResponseError(params, response.data, 'cancelOrder');
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
      data.symbol = params.symbol;
      const basePath = getBasePath(params.symbol);
      const response = await request.private('POST', `/${basePath}/private/order/cancelAll`, data);
      if (+response.data.ret_code !== 0 || response.status >= 400) {
        return handleResponseError(params, response.data, 'cancelOrdersAll');
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
      data.symbol = params.symbol;
      data.order_link_id = params.id;
      if (params.price) {
        data.p_r_price = params.price;
      }
      if (params.quantity) {
        data.p_r_qty = params.quantity;
      }
      const basePath = getBasePath(params.symbol);
      const response = await request.private('POST', `/${basePath}/private/order/replace`, data);
      if (+response.data.ret_code !== 0 || response.status >= 400) {
        return handleResponseError(params, response.data, 'updateOrder');
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
      data.currency = params.asset;
      const response = await request.private('GET', '/v2/private/wallet/balance', data);
      if (+response.data.ret_code !== 0 || response.status >= 400) {
        return handleResponseError(params, response.data, 'getEquity');
      }
      const equity = response.data.result[params.asset].equity;
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
      data.symbol = params.symbol;
      data.interval = getCandleResolution(params.interval);
      data.from = moment.utc(params.start).unix();
      data.limit = 200;
      const response = await request.public('GET', '/v2/public/kline/list', data);
      if (+response.data.ret_code !== 0 || response.status >= 400) {
        return handleResponseError(params, response.data, 'getCandles');
      }
      const candles = response.data.result.map(v => {
        const candle = {};
        candle.timestamp = moment.unix(v.open_time).utc().format('YYYY-MM-DD HH:mm:ss');
        candle.open = +v.open;
        candle.high = +v.high;
        candle.low = +v.low;
        candle.close = +v.close;
        candle.volume = +v.volume;
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
      data.symbol = params.symbol;
      const basePath = getBasePath(params.symbol);
      const response = await request.private('GET', `/${basePath}/private/position/list`, data);
      if (+response.data.ret_code !== 0 || response.status >= 400) {
        return handleResponseError(params, response.data, 'getPosition');
      }
      const positionResult = basePath === 'v2' ? response.data.result
        : response.data.result.find(v => v.data.symbol === params.symbol).data;
      const qtyS = positionResult.side === 'Sell' ? +positionResult.size : 0;
      const qtyB = positionResult.side === 'Buy' ? +positionResult.size : 0;
      const pxS = positionResult.side === 'Sell' ? +positionResult.entry_price : 0;
      const pxB = positionResult.side === 'Buy' ? +positionResult.entry_price : 0;
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
      const response = await request.public('GET', '/v2/public/tickers', data);
      if (+response.data.ret_code !== 0 || response.status >= 400) {
        return handleResponseError(params, response.data, 'getLastPrice');
      }
      const price = +response.data.result[0].last_price;
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
      // Get tickers 
      const tickersData = {};
      tickersData.symbol = params.symbol;
      const tickersResponse = await request.public('GET', '/v2/public/tickers', tickersData);
      if (tickersResponse.data.ret_code !== 0 || tickersResponse.status >= 400) {
        return handleResponseError(params, tickersResponse.data, 'getLiquidation 1');
      }
      // Get position
      const positionData = {};
      positionData.symbol = params.symbol;
      const basePath = getBasePath(params.symbol);
      const positionResponse = await request.private('GET', `/${basePath}/private/position/list`, positionData);
      if (positionResponse.data.ret_code !== 0 || positionResponse.status >= 400) {
        return handleResponseError(params, positionResponse.data, 'getLiquidation 2');
      }
      // Calculate liquidation
      const tickersResult = tickersResponse.data.result;
      const positionResult = basePath === 'v2' ? positionResponse.data.result
        : positionResponse.data.result.find(v => v.data.symbol === params.symbol).data;
      const markPx = +tickersResult[0].mark_price;
      const liqPxS = positionResult.side === 'Sell' ? +positionResult.liq_price : 0;
      const liqPxB = positionResult.side === 'Buy' ? +positionResult.liq_price : 0;
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
      const basePath = getBasePath(params.symbol);
      if (basePath === 'futures') { return { data: { current: 0, estimated: 0, } } };
      const response = await request.public('GET', '/v2/public/tickers', data);
      if (+response.data.ret_code !== 0 || response.status >= 400) {
        return handleResponseError(params, response.data, 'getFundingRates');
      }
      const current = +response.data.result[0].funding_rate;
      const estimated = +response.data.result[0].predicted_funding_rate;
      const fundings = { current, estimated, };
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
      const response = await request.public('GET', '/v2/public/tickers', data);
      if (+response.data.ret_code !== 0 || response.status >= 400) {
        return handleResponseError(null, response.data, 'getInstrumentsSymbols');
      }
      const symbols = response.data.result.map(v => v.symbol);
      return { data: symbols };
    },
  };
  return rest;
};
module.exports = Rest;
