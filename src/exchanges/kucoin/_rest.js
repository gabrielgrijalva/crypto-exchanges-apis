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
  if (responseData.code) {
    const errorCode = (responseData.code).toString();
    switch (errorCode)
    {
      case '0':
        type = 'no-function';
        break;
      case '0':
        type = 'order-not-found';
        break;
      case '0':
        type = 'post-only-reject';
        break;
      case '0':
        type = 'insufficient-funds';
        break;
      case '0':
        type = 'request-not-accepted';
        break; 
      case '0':
        type = 'immidiate-or-cancel-reject';
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
  if (interval === 300000) { return 5 };
  if (interval === 900000) { return 15 };
  if (interval === 1800000) { return 30 };
  if (interval === 3600000) { return 60 };
  if (interval === 7200000) { return 120 };
  if (interval === 14400000) { return 240 };
  if (interval === 28800000) { return 480 };
  if (interval === 43200000) { return 720 };
  if (interval === 86400000) { return 1440 };
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
  async function private(method, path, data, query) {
    const timestamp = Date.now();
    const dataStringified = data ? JSON.stringify(data) : '';
    const queryStrigified = query ? `?${qs.stringify(query)}` : '';
    const digest = `${timestamp}${method}${path}${queryStrigified}${dataStringified}`;
    const signature = crypto.createHmac('sha256', restSettings.API_SECRET).update(digest).digest('base64');
    const passphrase = crypto.createHmac('sha256', restSettings.API_SECRET).update(restSettings.API_PASSPHRASE).digest('base64');
    const requestSendParams = {
      url: `${restSettings.URL}${path}${queryStrigified}`,
      data: dataStringified,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'KC-API-KEY': restSettings.API_KEY,
        'KC-API-SIGN': signature,
        'KC-API-TIMESTAMP': timestamp,
        'KC-API-KEY-VERSION': "2",
        'KC-API-PASSPHRASE': passphrase,
      },
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
  restSettings.URL = restSettings.URL || 'https://api-futures.kucoin.com';
  restSettings.REQUESTS_REFILL = restSettings.REQUESTS_REFILL || false;
  restSettings.REQUESTS_REFILL_LIMIT = restSettings.REQUESTS_REFILL_LIMIT || 60;
  restSettings.REQUESTS_REFILL_AMOUNT = restSettings.REQUESTS_REFILL_AMOUNT || 60;
  restSettings.REQUESTS_REFILL_INTERVAL = restSettings.REQUESTS_REFILL_INTERVAL || 2000;
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
      data.clientOid = params.id;
      data.side = params.side;
      data.symbol = params.symbol;
      data.size = `${params.quantity}`;
      data.leverage = 10;
      if (params.type === 'limit') {
        data.price = `${params.price}`;
        data.type = 'limit';
      }
      if (params.type === 'market') {
        data.type = 'market';
      }
      if (params.type === 'post-only') {
        data.price = `${params.price}`;
        data.type = 'limit';
        data.postOnly = true;
      }
      if (params.type === 'immidiate-or-cancel') {
        data.price = `${params.price}`;
        data.type = 'limit';
        data.timeInForce = 'IOC';
      }
      const response = await request.private('POST', '/api/v1/orders', data);
      if (response.data.code !== '200000') {
        return handleResponseError(params, response.data);
      }
      params.id = response.data.data.orderId
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
      const response = await request.private('DELETE', `/api/v1/orders/${params.id}`, null, null);
      if (response.data.code !== '200000') {
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
      data.symbol = params.symbol;
      const response = await request.private('DELETE', '/api/v1/orders', null, data);
      if (response.data.code !== '200000') {
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
      data.currency = params.asset;
      const response = await request.private('GET', '/api/v1/account-overview', null, data);
      if (response.data.code !== '200000') {
        return handleResponseError(params, response.data);
      }
      const asset = response.data.data;
      const equity = asset ? +asset.accountEquity : 0;
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
      const timestamp = moment.utc().startOf('minute').valueOf();
      const data = {};
      data.symbol = params.symbol;
      data.granularity = getCandleResolution(params.interval);
      data.from = moment.utc(params.start).valueOf();
      data.end = moment.utc(params.start).add(params.interval * 199, 'milliseconds').valueOf();
      data.end = data.end < timestamp ? data.end : timestamp;
      const response = await request.public('GET', '/api/v1/kline/query', data);
      if (response.data.code !== '200000') {
        return handleResponseError(params, response.data);
      }
      const candles = response.data.data.map(v => {
        const candle = {};
        candle.timestamp = moment(+v[0]).utc().format('YYYY-MM-DD HH:mm:ss');
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
      data.symbol = params.symbol;
      const response = await request.private('GET', '/api/v1/position', null, data);
      if (response.data.code !== '200000') {
        return handleResponseError(params, response.data);
      }
      const positionData = response.data.data;
      const qtyS = positionData && +positionData.currentQty < 0 ? Math.abs(+positionData.currentQty) : 0;
      const qtyB = positionData && +positionData.currentQty > 0 ? Math.abs(+positionData.currentQty) : 0;
      const pxS = positionData && +positionData.currentQty < 0 ? +positionData.avgEntryPrice : 0;
      const pxB = positionData && +positionData.currentQty > 0 ? +positionData.avgEntryPrice : 0;
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
      const response = await request.public('GET', '/api/v1/ticker', data);
      if (response.data.code !== '200000') {
        return handleResponseError(params, response.data);
      }
      const price = +response.data.data.price;
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
      const data = {};
      data.symbol = params.symbol;
      const response = await request.private('GET', '/api/v1/position', null, data);
      if (response.data.code !== '200000') {
        return handleResponseError(params, response.data);
      }
      const positionData = response.data.data;
      const markPx = +positionData.markPrice;
      const liqPxS = positionData && +positionData.currentQty < 0 ? +positionData.liquidationPrice : 0;
      const liqPxB = positionData && +positionData.currentQty > 0 ? +positionData.liquidationPrice : 0;
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
      const response = await request.public('GET', `/api/v1/funding-rate/${params.symbol}/current`, data);
      if (response.data.code !== '200000') {
        return handleResponseError(params, response.data);
      }
      const current = response.data.data.value;
      const estimated = response.data.data.predictedValue;
      const fundings = { current, estimated };
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
      const response = await request.public('GET', '/api/v1/contracts/active', data);
      if (response.data.code !== '200000') {
        return handleResponseError(response.data);
      }
      const symbols = response.data.data.map(v => v.symbol);
      return { data: symbols };
    },
    /**
     * 
     * 
     * GET ORDER BOOK
     * 
     * 
     */
    _getOrderBook: async (params) => {
      const data = {};
      data.symbol = params.symbol;
      const response = await request.public('GET', '/api/v1/level2/snapshot', data);
      if (response.data.code !== '200000') {
        return handleResponseError(params, response.data);
      }
      const asks = response.data.data.asks.map(ask => {
        return { id: +ask[0], price: +ask[0], quantity: +ask[1] };
      });
      const bids = response.data.data.bids.map(bid => {
        return { id: +bid[0], price: +bid[0], quantity: +bid[1] };
      });
      const lastUpdateId = +response.data.data.sequence;
      return { data: { asks, bids, lastUpdateId } };
    },
  };
  return rest;
};
module.exports = Rest;
