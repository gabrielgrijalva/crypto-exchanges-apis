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
  if (+responseData.code !== 0) {
    if (+responseData.code === 3103) {
      type = 'order-not-found';
    }
    if (+responseData.code === 3129) {
      type = 'post-only-reject';
    }
    if (+responseData.code === 3007 || +responseData.code === 3008 || +responseData.code === 4001
      || +responseData.code === 4002 || +responseData.code === 4003) {
      type = 'request-not-accepted';
    }
    if (+responseData.code === 3109) {
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
/**
 * @param {number} interval 
 * @returns {string | number}
 */
function getCandleResolution(interval) {
  if (interval === 60000) { return '1min' };
  if (interval === 300000) { return '5min' };
  if (interval === 900000) { return '15min' };
  if (interval === 1800000) { return '30min' };
  if (interval === 3600000) { return '1hour' };
  if (interval === 7200000) { return '2hour' };
  if (interval === 14400000) { return '4hour' };
  if (interval === 21600000) { return '6hour' };
  if (interval === 43200000) { return '12hour' };
  if (interval === 86400000) { return '1day' };
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
    const dataStr = method === 'POST' ? qs.stringify(data) : '';
    const queryStr = method === 'GET' ? qs.stringify(data) : '';
    const signatureStr = (dataStr || queryStr ? `${dataStr || queryStr}&` : '') + `secret_key=${restSettings.API_SECRET}`;
    const signature = crypto.createHash('sha256').update(signatureStr).digest('hex');
    const requestSendParams = {
      url: `${restSettings.URL}${path}?${queryStr}`,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'AccessId': restSettings.API_KEY,
        'Authorization': signature,
      },
      data: dataStr,
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
  restSettings.URL = restSettings.URL || 'https://api.coinex.com/perpetual/v1';
  restSettings.REQUESTS_REFILL = restSettings.REQUESTS_REFILL || false;
  restSettings.REQUESTS_REFILL_LIMIT = restSettings.REQUESTS_REFILL_LIMIT || 400;
  restSettings.REQUESTS_REFILL_AMOUNT = restSettings.REQUESTS_REFILL_AMOUNT || 400;
  restSettings.REQUESTS_REFILL_INTERVAL = restSettings.REQUESTS_REFILL_INTERVAL || 10000;
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
      let requestPath = '';
      const data = {};
      data.side = params.side === 'sell' ? 1 : 2;
      data.market = params.symbol;
      data.amount = `${params.quantity}`;
      data.timestamp = Date.now();
      if (params.type === 'limit') {
        requestPath = 'limit';
        data.price = params.price;
      }
      if (params.type === 'market') {
        requestPath = 'market';
      }
      if (params.type === 'post-only') {
        requestPath = 'limit';
        data.price = params.price;
        data.option = 1;
      }
      if (params.type === 'immidiate-or-cancel') {
        requestPath = 'limit';
        data.price = params.price;
        data.effect_type = 2;
      }
      const response = await request.private('POST', `/order/put_${requestPath}`, data);
      if (+response.data.code !== 0 || response.status >= 400) {
        return handleResponseError(params, response.data, 'createOrder');
      }
      params.id = response.data.data.order_id.toString();
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
      data.market = params.symbol;
      data.order_id = +params.id;
      data.timestamp = Date.now();
      const response = await request.private('POST', '/order/cancel', data);
      if (+response.data.code !== 0 || response.status >= 400) {
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
    cancelOrders: async (params) => {
      const data = {};
      data.market = params[0].symbol;
      data.order_ids = params.map(v => +v.id).join('p');
      data.timestamp = Date.now();
      const response = await request.private('POST', '/order/cancel_batch', data);
      if (+response.data.code !== 0 || response.status >= 400) {
        return params.map(v => handleResponseError(v, response.data, 'cancelOrders'));
      }
      return params.map(v => { return { data: v } });
    },
    /**
     * 
     * 
     * CANCEL ORDERS ALL
     * 
     * 
     */
    cancelOrdersAll: async (params) => {
      const data = {};
      data.market = params.symbol;
      data.timestamp = Date.now();
      const response = await request.private('POST', '/order/cancel_all', data);
      if (+response.data.code !== 0 || response.status >= 400) {
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
    updateOrder: null,
    /**
     * 
     * 
     * UPDATE ORDERS
     * 
     * 
     */
    updateOrders: null,
    /**
     * 
     * 
     * GET EQUITY
     * 
     * 
     */
    getEquity: async (params) => {
      const data = {};
      data.timestamp = Date.now();
      const response = await request.private('GET', '/asset/query', data);
      if (+response.data.code !== 0 || response.status >= 400) {
        return handleResponseError(params, response.data, 'getEquity');
      }
      const asset = response.data.data[params.asset];
      const equity = (+asset.balance_total) + (+asset.margin) + (+asset.profit_unreal);
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
      data.type = getCandleResolution(params.interval);
      data.limit = 1000;
      data.market = params.symbol;
      const response = await request.public('GET', '/market/kline', data);
      if (+response.data.code !== 0 || response.status >= 400) {
        return handleResponseError(params, response.data, 'getCandles');
      }
      const candles = response.data.data.map(v => {
        const candle = {};
        candle.timestamp = moment.unix(v[0]).utc().format('YYYY-MM-DD HH:mm:ss');
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
      data.market = params.symbol;
      data.timestamp = Date.now();
      const response = await request.private('GET', '/position/pending', data);
      if (+response.data.code !== 0 || response.status >= 400) {
        return handleResponseError(params, response.data, 'getPosition');
      }
      const positionResult = response.data.data.find(v => v.market === params.symbol);
      const qtyS = positionResult && positionResult.side === 1 ? +positionResult.amount : 0;
      const qtyB = positionResult && positionResult.side === 2 ? +positionResult.amount : 0;
      const pxS = positionResult && positionResult.side === 1 ? +positionResult.open_price : 0;
      const pxB = positionResult && positionResult.side === 2 ? +positionResult.open_price : 0;
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
      data.market = params.symbol;
      const response = await request.public('GET', '/market/deals', data);
      if (+response.data.code !== 0 || response.status >= 400) {
        return handleResponseError(params, response.data, 'getLastPrice');
      }
      const price = +response.data.data[0].price;
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
      const tickerData = {};
      tickerData.market = params.symbol;
      const tickerResponse = await request.public('GET', '/market/ticker', tickerData);
      if (tickerResponse.data.code !== 0 || tickerResponse.status >= 400) {
        return handleResponseError(params, tickerResponse.data, 'getLiquidation 1');
      }
      // Get position
      const positionData = {};
      positionData.market = params.symbol;
      positionData.timestamp = Date.now();
      const positionResponse = await request.private('GET', '/position/pending', positionData);
      if (positionResponse.data.code !== 0 || positionResponse.status >= 400) {
        return handleResponseError(params, positionResponse.data, 'getLiquidation 2');
      }
      // Calculate liquidation
      const positionResult = positionResponse.data.data.find(v => v.market === params.symbol);
      const markPx = +tickerResponse.data.data.ticker.sign_price;
      const liqPxS = positionResult && positionResult.side === 1 ? +positionResult.liq_price : 0;
      const liqPxB = positionResult && positionResult.side === 2 ? +positionResult.liq_price : 0;
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
      data.market = params.symbol;
      const response = await request.public('GET', '/market/ticker', data);
      if (+response.data.code !== 0 || response.status >= 400) {
        return handleResponseError(params, response.data, 'getFundingRates');
      }
      const current = +response.data.data.ticker.funding_rate_next;
      const estimated = +response.data.data.ticker.funding_rate_predict;
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
      const response = await request.public('GET', '/market/list', data);
      if (+response.data.code !== 0 || response.status >= 400) {
        return handleResponseError(null, response.data, 'getInstrumentsSymbols');
      }
      const symbols = response.data.data.map(v => v.name);
      return { data: symbols };
    },
  };
  return rest;
};
module.exports = Rest;
